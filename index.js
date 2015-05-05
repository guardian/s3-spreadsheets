var async = require('async');
var gSpreadsheet = require('./googleSpreadsheet');
var s3 = require('./s3');
var fs = require('fs');
var domain = require('domain');

try {
  var config = require('./config.json');
} catch(err) {
  console.log('Missing config.json. Use sample-config.json as a reference.');
}

var statusFile = './status.txt';
var statusText;
var ASYNC_LIMIT = 5; // Limit the number of async requests
var FETCH_DELEY = 60 * 1000; // Wait for one minute
var startTime;
var endTime;

/**
 * Handle the returned master spreadsheet data
 *
 * @param data {object} - Tabletop models of sheets in spreadsheet
 * @param tabletop {object} - An instance of tabletop
 */
function parseMastersheet(data, tabletop) {
    // TODO: Handle mastersheet parse error
    var spreadsheets = tabletop.sheets('data').all();
    updateStatus('Got mastersheet. Spreadsheet count = ' + spreadsheets.length);
    async.mapLimit(spreadsheets, ASYNC_LIMIT, fetchSheet, parseSheets); 
}

/**
 * Parse all the spreadsheets
 *
 * @param err {null|string} - async error response
 * @param sheets {array} - All the spreadsheets listed in the master file
 */
function parseSheets(err, sheets) {
    if (err) return console.error(err);

    // Filter out errors in sheets
    var validSheets = sheets.filter(function(sheet) {
        if (sheet && isValidKey(sheet.sheet.key) === true) {
            return true;
        }
    });

    // Create JSON files
    var uploadData = validSheets.map(function(sheet) {
        return createUploadData(sheet, false);
    });

    // Upload all files
    uploadSheets(uploadData);
}

/**
 * Upload all spreadsheets to S3
 *
 * @param sheets {array} - Sheets to be uploaded to S3
 */
function uploadSheets(sheets) {
    async.eachLimit(sheets, ASYNC_LIMIT, uploadSheet, finished);
}

/**
 * Upload single sheet to S3
 *
 * @param data {object} - spreadsheet to be uploaded to S3
 * @param data.filename {string} - Name of the file
 * @param data.json {string} - File contents as JSON string
 * @param data.cacheAge {string} - Cache age
 * @param callback {function} - Async callback on completion
 */
function uploadSheet(data, callback) {
    updateStatus('Uploading sheet - ' + data.filename);
    s3.put(data, callback);
}

/**
 * Prep data for uploading
 *
 * @param data {object} - Spreadsheet data
 * @param data.sheet {object} - Original spreadsheet data
 * @param data.sheet.name {string} - Spreadsheet name
 * @param data.sheet.cacheage {string} - Cache age
 * @param data.sheet.key {string} - Google spreadsheet key
 * @param data.tabletop {object} - Tabletop instance
 */
function createUploadData(data) {
    var spreadsheetName = (data.sheet.name) ? data.sheet.name : 'undefined';
    var sheets = (data.sheet.specificsheets === "") ? [] : data.sheet.specificsheets.split(',');
    var cacheControl = 'max-age=' + (data.sheet.cacheage || '60') + ', public';
    var body = createJSON(data.tabletop, spreadsheetName, sheets);

    return {
        body: body,
        filename: data.sheet.key + '.json',
        cacheControl: cacheControl,
        contentType: 'application/json'
    };
  
}

/**
 * Parse data into JSON format
 *
 * @param tabletop {object} - Tabletop instance
 * @param spreadsheetName {string} - Name of the spreadsheet
 * @param sheets {array} - Specific sheets to return
 * @returns {object} - Data for uploading containing JSON string
 */
function createJSON(tabletop, spreadsheetName, sheets) {
    var jsonContent = {
        sheets: {},
        updated: Date(),
        name: spreadsheetName
    };

    // Return only specific sheets or all sheets
    if (sheets.length > 0) {
        sheets.forEach(function(sheetName) {
            var sheet = sheetName.trim();
            if (tabletop.model_names.indexOf(sheet) > -1) {
                jsonContent.sheets[sheet] = tabletop.sheets(sheet).all();
            }
        });
    } else {
        tabletop.model_names.forEach(function(modelName) {
            jsonContent.sheets[modelName] = tabletop.sheets(modelName).all();
        });
    }

    var json = JSON.stringify(jsonContent);
    json = json.replace(/(\r\n|\n|\r)/gm, '');
    return json;
}


/**
 * Test if key is a valid Google spreadsheet key
 *
 * @param key {string} - Google spreadsheet key
 * @returns {boolean} - Valid status
 */
function isValidKey(key) {
    return (key.length === 44 && (true === /^[\d\w-]+$/.test(key)));
}


/**
 * Fetch a single sheet from Google
 *
 * @param sheet {object} - Sheet data
 * @param sheet.key {string} - Key of the Google spreadsheet
 * @param callback {function} - Async callback on completion
 */
function fetchSheet(sheet, callback) {
    var d = domain.create();

    d.on('error', function(err) {
        updateStatus('!!ERROR - '+sheet.key+' "'+sheet.name+'": "'+err.message+'"');
        callback();
    });

    d.run(function() {
        gSpreadsheet.fetch(sheet.key, function(data, tabletop) {
            updateStatus('Fetched - ' + sheet.key);
            callback(null, {sheet: sheet, tabletop: tabletop});
        });
    });
}



function finished(err) {
    if (err) {
        console.error(Date() + 'Error: ', err);
    }
    
    var endTime = new Date();
    var timeTaken = endTime - startTime;

    // Log warning if process it taking too long
    if (timeTaken >= FETCH_DELEY) {
        updateStatus('WARNING: Process taking a long time: ' + timeTaken/1000 + s);
    }

    var delay = FETCH_DELEY - timeTaken;
    updateStatus('Next fetch in ' + delay / 1000 + 's');

    // Check if last fetch took longer than delay and force instant fetch
    if (delay < 0) {
        start();
    } else {
        setTimeout(start, delay); 
    }

    updateStatus('Finished in ' + (timeTaken / 1000) + 's');
    outputStatusFile();
}


function updateStatus(msg) {
    statusText += Date() + ': ' + msg + '\n';
}

function outputStatusFile() {
    // Write file locally
    fs.writeFile(statusFile, statusText, function(err) {
        if (err) {
            console.log('ERROR writing status file', err);
        }
    });

    // Put file on S3
    s3.put({
        body: statusText,
        filename: 'status.txt',
        cacheControl: 'no-cache',
        contentType: 'text/plain'
    }, function(err) {
        if (err) {
            console.log('Error writing status', err);
        }
    });
}

function start() {
    startTime = new Date();
    
    // Create new status text string
    statusText = '';
    updateStatus('Starting fetch');

    // TODO: Handle master sheet fetch fail
    gSpreadsheet.fetch(config.masterKey, parseMastersheet);
}

start();

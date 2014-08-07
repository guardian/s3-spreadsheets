var async = require('async');
var gSpreadsheet = require('./googleSpreadsheet');
var s3 = require('./s3');
var CronJob = require('cron').CronJob;

try {
  var config = require('./config.json');
} catch(err) {
  console.log('Missing config.json. Use sample-config.json as a reference.');
}

/**
 * Handle the returned master spreadsheet data
 *
 * @param data {object} - Tabletop models of sheets in spreadsheet
 * @param tabletop {object} - An instance of tabletop
 */
function parseMastersheet(data, tabletop) {
  var spreadsheets = tabletop.sheets('data').all();
  async.map(spreadsheets, fetchSheet, parseSheets); 
}

/**
 * Parse all the spreadsheets
 *
 * @param err {null|string} - async error response
 * @param sheets {array} - All the spreadsheets listed in the master file
 */
function parseSheets(err, sheets) {
  if (err) return console.error(err);
  
  // Create JSON files
  var uploadData = sheets.map(function(sheet) {
    return createUploadData(sheet, false);
  });

  // Append JSONP files
  uploadData = uploadData.concat(sheets.map(function(sheet) {
    return createUploadData(sheet, true);
  }));

  // Upload all files
  uploadSheets(uploadData);
}

/**
 * Upload all spreadsheets to S3
 *
 * @param sheets {array} - Sheets to be uploaded to S3
 */
function uploadSheets(sheets) {
  async.each(sheets, uploadSheet, function(err) {
    if (err) return console.error(err);
  });
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
 * @param isJSONP {boolean} - Wrap the JSON in a JSONP or not
 */
function createUploadData(data, isJSONP) {
  var spreadsheetName = (data.sheet.name) ? data.sheet.name : 'undefined';
  var cacheControl = 'max-age=' + (data.sheet.cacheage || '60') + ', public';
  var body = createJSON(data.tabletop, spreadsheetName);
  
  if (isJSONP) {
    body = createJSONP(body);
  }

  return {
    body: body,
    filename: data.sheet.key + ((isJSONP) ? '.jsonp' : '.json'),
    cacheControl: cacheControl,
    contentType: (isJSONP) ? 'application/javascript' : 'application/json'
  };
  
}

/**
 * Parse data into JSON format
 *
 * @param tabletop {object} - Tabletop instance
 * @param spreadsheetName {string} - Name of the spreadsheet
 * @returns {object} - Data for uploading containing JSON string
 */
function createJSON(tabletop, spreadsheetName) {
  var jsonContent = {
      sheets: {},
      updated: Date(),
      name: spreadsheetName
  };

  tabletop.model_names.forEach(function(modelName) {
      jsonContent.sheets[modelName] = tabletop.sheets(modelName).all();
  });

  var json = JSON.stringify(jsonContent);
  json = json.replace(/(\r\n|\n|\r)/gm, '');
  return json;
}


/**
 * Wrap JSON string in a function call creating a JSONP string
 *
 * @param json {string} - JSON string to wrap
 * @returns {string} - JSONP string
 */
function createJSONP(json) {
  return config.callbackName + '(' + json + ');';
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
  // Check sheet has a valid key
  if (isValidKey(sheet.key) === false) {
    return callback('Spreadsheet key is invalid: ' + sheet.key);
  }

  gSpreadsheet.fetch(sheet.key, function(data, tabletop) {
    callback(null, {sheet: sheet, tabletop: tabletop});
  });
}


/**
 * Action to run on every cron tick
 */
function cronTickAction() {
    gSpreadsheet.fetch(config.masterKey, parseMastersheet);
}

// Start a schedualed fetch and upload of all spreadsheets
// Once every minute
var cronJob = new CronJob({
  cronTime: '00 * * * * *',
  onTick: cronTickAction,
  start: false
});

cronJob.start();

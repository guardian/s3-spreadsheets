var config = require('./config.json');
var knox = require('knox');
var Tabletop = require('tabletop');
var https = require('https');

var spreadsheets = [];
var callbackCounter = 0;

function fetchConfig(callback) {
    var tabletop = Tabletop.init({
        key: config.spreadsheetsKey,
        callback: processSpreadsheet,
        simpleSheet: true
    });
}

fetchConfig();



function processSpreadsheet(data, tabletop) {
    data.map(fetchSpreadsheet);
}

function fetchSpreadsheet(spreadsheet) {
    var spreadsheetKey = spreadsheet.key.trim();
    if (false === isValidKey(spreadsheetKey)) {
        console.log('Invalid key: %s', spreadsheetKey);
        return;
    }


    // Fetch spreadsheet from Google
    var tabletopOptions = {
        key: spreadsheetKey,
        callback: handleGSResponse,
        simpleSheet: false,
        debug: false,
        parseNumbers: true
    };
    var tableTop = Tabletop.init(tabletopOptions);

    function handleGSResponse(data, tabletop) {
        var feedName = (spreadsheet.name) ? spreadsheet.name : 'undefined';
        var jsonContent = {
            sheets: {},
            updated: Date(),
            name: feedName
        };

        tabletop.model_names.forEach(function(modelName) {
            jsonContent.sheets[modelName] = tabletop.sheets(modelName).all();
        });

        var json = JSON.stringify(jsonContent);
        json = json.replace(/(\r\n|\n|\r)/gm, '');

        var jsonp = config.callbackName + '(' + json + ')';
        putJSONP(jsonp, spreadsheetKey, spreadsheet.cacheAge);
    }
}

function finish() {
    callbackCounter += 1;
    if (callbackCounter === spreadsheets.length) {
        process.exit(code=0);
    }
}

// Upload data to S3
var s3Client = knox.createClient({
    key:    config.accessKey,
    secret: config.secretKey,
    bucket: config.bucket,
    region: config.region
});

function putJSONP(jsonpData, spreadsheetKey, cacheAge) {
    console.log(jsonpData, spreadsheetKey);
    return;
    var cache = cacheAge || '60';
    var destFile = config.destFolder + spreadsheetKey + '.jsonp';
    var req = s3Client.put(destFile, {
        'Content-Length': Buffer.byteLength(jsonpData, 'utf8'),
        'Content-Type'  : 'application/javascript',
        'x-amz-acl'     : 'public-read',
        'Cache-Control' : 'public, max-age=' + cache
    });

    req.on('response', function(response) {
        if (200 === response.statusCode) {
            //console.log('Saved to %s at %s', response.req.url, Date());
        } else {
            console.log('Failed to upload. Status: %d', response.statusCode);
        }

        finish();
    });

    req.end(jsonpData);
}

function isValidKey(key) {
    return (key.length === 44 && (true === /^[\d\w-]+$/.test(key)));
}

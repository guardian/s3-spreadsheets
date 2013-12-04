var config = require('./config.json');
var knox = require('knox');
var Tabletop = require('tabletop');

var callbackCounter = 0;
var spreadsheets = config.spreadsheets;
spreadsheets.map(fetchSpreadsheet);

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
        var sheetName = 'data';
        if (-1 === tabletop.model_names.indexOf('data')) {
            sheetName = 'Sheet1';
        }
        var sheetData = tabletop.sheets(sheetName);

        if (typeof sheetData === 'undefined') {
            console.log('Could not access sheet "data" of %s', spreadsheetKey);
            finish();
            return false;
        }

        var jsonContent = {
            data: sheetData.all(),
            updated: Date()
        };
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
    var cache = cacheAge || '60';
    var destFile = config.destFolder + spreadsheetKey + '.jsonp';
    var req = s3Client.put(destFile, {
        'Content-Length': Buffer.byteLength(jsonpData, 'utf8'),
        'Content-Type'  : 'application/javascript',
        'x-amz-acl'     : 'public-read',
        'Cache-Control' : 'public, max-age=' + cache,
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
    if (key.length !== 44) {
        return false;
    }

    // Only contain alphanumeric values
    if (false === /^[\d\w]+$/.test(key)) {
        return false;
    }

    return true;
}

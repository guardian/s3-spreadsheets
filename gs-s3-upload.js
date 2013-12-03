var config = require('./config.json');
var knox = require('knox');
var Tabletop = require('tabletop');

var callbackCounter = 0;
var gsKeys = config.spreadsheetKeys.split(',');
gsKeys.map(function(key) {
    fetchSpreadsheet(key.trim());
});

function fetchSpreadsheet(spreadsheetKey) {
    if (false === isValidKey(spreadsheetKey)) {
        console.log('Invalid key: %s', spreadsheetKey);
        return;
    }

    // Fetch spreadsheet from Google
    var tabletopOptions = {
        key: spreadsheetKey,
        callback: handleGSResponse,
        simpleSheet: false,
        debug: true,
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
        console.log('PUTing data up to S3...', spreadsheetKey);
        putJSONP(jsonp, spreadsheetKey);
    }
}

function finish() {
    callbackCounter += 1;
    if (callbackCounter === gsKeys.length) {
        process.exit(code=0);
    }
}

// Upload data to S3
var s3Client = knox.createClient({
    key:    config.accessKey,
    secret: config.secretKey,
    bucket: config.bucket,
    region: 'eu-west-1'
});

function putJSONP(jsonpData, spreadsheetKey) {
    var destFile = config.destFolder + spreadsheetKey + '.jsonp';
    var req = s3Client.put(destFile, {
        'Content-Length': Buffer.byteLength(jsonpData, 'utf8'),
        'Content-Type'  : 'application/javascript',
        'x-amz-acl'     : 'public-read',
        'Cache-Control' : 'public, max-age=' + config.cacheAge,
    });

    req.on('response', function(response) {
        if (200 === response.statusCode) {
            console.log('Saved to %s', response.req.url);
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

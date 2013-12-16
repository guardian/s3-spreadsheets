var config = require('./config.json');
var knox = require('knox');
var Tabletop = require('tabletop');
var https = require('https');

var spreadsheets = [];
var callbackCounter = 0;

function fetchConfig() {
    var path = '/feeds/list/' + config.spreadsheetsKey +  '/od6/public/values?alt=json';
    var options = {
        hostname: 'spreadsheets.google.com',
        port: 443,
        path: path,
        method: 'GET'
    };

    var req = https.get(options, function(res) {
        if (res.statusCode !== 200) {
            console.log('Error: Request failed with status code %d', res.statusCode);
            return;
        }

        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            var responseObj = JSON.parse(body)
            var entries = responseObj.feed.entry;
            entries.forEach(processSpreadsheet);
            spreadsheets.map(fetchSpreadsheet);
        });
    });

    req.on('error', function(e) {
        console.log("Got error: ", e);
    });
}

fetchConfig();



function processSpreadsheet(spreadsheet) {
    if (!spreadsheet.gsx$valid || spreadsheet.gsx$valid.$t === 'FALSE') {
        console.log('Error: Skipping %s spreadsheet because invalid.', spreadsheet.gsx$name.$t);
        return;
    }

    var sheet = {
        name: spreadsheet.gsx$name.$t,
        key: spreadsheet.gsx$key.$t,
        cacheAge: spreadsheet.gsx$cache.$t
    }

    spreadsheets.push(sheet);
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
        var sheetData = tabletop.sheets(tabletop.model_names[0]);

        if (typeof sheetData === 'undefined') {
            console.log('Could not access sheet "data" of %s', spreadsheetKey);
            finish();
            return false;
        }

        var feedName = (spreadsheet.name) ? spreadsheet.name : 'undefined';

        var jsonContent = {
            data: sheetData.all(),
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

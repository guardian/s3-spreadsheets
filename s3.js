var knox = require('knox');
var config = require('./config.json');

var s3Client = knox.createClient({
    key:    config.accessKey,
    secret: config.secretKey,
    bucket: config.bucket,
    region: config.region
});

/**
 * PUT data into the S3 bucket
 * 
 * @param data {object} - Upload content
 * @param data.filename {string} - Name of the file
 * @param data.json {string} - File contents as JSON string
 * @param data.cacheAge {string} - Cache age
 * @param callback {function} - Async callback on completion
 */
function put(data, callback) {
    var destFile = config.destFolder + data.filename;
    var req = s3Client.put(destFile, {
        'Content-Length': Buffer.byteLength(data.json, 'utf8'),
        'Content-Type'  : data.contentType,
        'x-amz-acl'     : 'public-read',
        'Cache-Control' : 'max-age=' + data.cacheAge + ', public'
    });

    req.on('response', function(response) {
        if (200 === response.statusCode) {
          callback(null);
        } else {
          callback('Failed to upload. Status: %d', response.statusCode);
        }

    });

    req.end(data.json);
}

module.exports = {
  put: put
};


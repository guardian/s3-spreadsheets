var zlib = require('zlib');
var AWS = require('aws-sdk');

try {
  var config = require('./config.json');
} catch(err) {
  console.log('Missing config.json. Use sample-config.json as a reference.');
}

var s3 = new AWS.S3({
    region          : config.region,
    accessKeyId     : config.accessKey,
    secretAccessKey : config.secretKey
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
    var filename = config.destFolder + data.filename;
    var params = {
      Bucket          : config.bucket,
      Key              : filename,
      ACL              : 'public-read',
      ContentType      : data.contentType,
      CacheControl     : data.cacheControl,
      ContentEncoding  : 'gzip'
    };

    zlib.gzip(data.body, function(err, buffer) {
      if (err) return callback(err);
      params.Body = buffer;

      s3.putObject(params, function(err) {
        return callback(err);
      });
    });
}

module.exports = {
  put: put
};


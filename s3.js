//var knox = require('knox');
var AWS = require('aws-sdk');
var config = require('./config.json');
var s3 = new AWS.S3({
  params: {
    Bucket: config.bucket,
    region: config.region,
  }
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
    var s3Data = {
      Key: destFile,
      Body: data.json,
      ACL: 'public-read',
      ContentLength: Buffer.byteLength(data.json, 'utf8'),
      ContentType: data.contentType,
      CacheControl: data.cacheControl 
    };

   s3.putObject(s3Data, function(err, d) {
      return callback(err);
   });
}

module.exports = {
  put: put
};


var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var path = require('path');
var mimetypes = require('./mimetypes');

module.exports = (function() { 'use strict';
  var BOUNDRARY = '----Y0uR3tH3m4nN0wd0g';
  var MULTIPART_END = '\r\n--' + BOUNDRARY + '--\r\n';

  function upload(uploadUrl, parsedUri, uploadOptions, fileSize, fileName, callback) {
    var form = getMultipartForm(uploadOptions.fields, uploadOptions.fileId, fileName, uploadOptions.fileContentType);
    var contentLength = form.length + fileSize + MULTIPART_END.length;
    var resData = '';

    var uploadProtocol = getProtocol(uploadUrl);

    var headers = {
      'Content-Length': contentLength,
      'Content-Type': 'multipart/form-data; boundary=' + BOUNDRARY
    };
    if (uploadOptions.uploadHeaders) {
      for (var attr in uploadOptions.uploadHeaders) { headers[attr] = uploadOptions.uploadHeaders[attr]; }
    }

    var options = getRequestOptions('POST', uploadUrl, headers, uploadOptions.uploadAgent);

    var req = uploadProtocol.request(options, function(res) {
      if ((res.statusCode < 200) || (res.statusCode >= 300)) {
        return callback('Invalid response from upload server. statusCode: ' + res.statusCode);
      }
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        resData += chunk;
      });
      res.on('end', function() {
        callback(null, resData);
      });
    });
    /** We do not want to buffer any data since we could buffer a ton of data before the connection
    * is made (or not), lets wait to be connected to the remote server before sending any data */
    req.on('socket', function() {
      req.socket.on('connect', function() {
        req.write(form);
        if (!parsedUri.isValidUrl) {
          var fileStream = fs.createReadStream(parsedUri.path);
          fileStream.on('data', function (data) {
            req.write(data);
          });
          fileStream.on('end', function() {
            req.write(MULTIPART_END);
            req.end();
          });
          fileStream.on('error', function(err) {
            req.destroy(err);
          });
        }
        else {
          var downloadProtocol = getProtocol(parsedUri);
          var downloadOptions = getRequestOptions('GET', parsedUri, uploadOptions.downloadHeaders, uploadOptions.downloadAgent);
          var downloadReq = downloadProtocol.request(downloadOptions, function(res) {
            if ((res.statusCode < 200) || (res.statusCode >= 300)) {
              downloadReq.destroy('Invalid response from remote file server. statusCode: ' + res.statusCode);
            }
            res.on('data', function (data) {
              req.write(data);
            });
            res.on('end', function() {
              req.write(MULTIPART_END);
              req.end();
            });
          });
          downloadReq.on('error', function(err) {
            req.destroy(err);
          });
          downloadReq.end();
        }
      });
    });
    req.on('error', function(err) {
      return callback(err);
    });
  }
  /** this function is kind of hacky, but since not all web servers support chunked
  * encoding and we DO NOT want to buffer any of the file we're downloading into memory,
  * this is how we get around this so we can calculate the content-length. while this
  * does indeed slow down the upload, it does save us some time if the file doesn't exist
  * on the remote web server of if maxFileSize is provided, we can bail out if it's too large */
  function head(url, uploadOptions, redirectCount, callback) {
    var options = getRequestOptions('HEAD', url, uploadOptions.downloadHeaders, uploadOptions.downloadAgent);

    var downloadProtocol = getProtocol(url);

    var req = downloadProtocol.request(options, function(res) {
      try {
        if ((res.statusCode == 301) || (res.statusCode == 302)) {
          if (redirectCount >= uploadOptions.maxRedirects) {
            return callback('Redirect count reached. Aborting upload.');
          }
          
          var location = res.headers.location;
          if (location) {
            redirectCount++;
            var redirectUrl = parseUri(location);
            return head(redirectUrl, uploadOptions, redirectCount, callback);
          }
        }

        if ((res.statusCode < 200) || (res.statusCode >= 300)) {
          return callback('Invalid response from remote file server. statusCode: ' + res.statusCode);
        }
        
        var contentLength = parseInt(res.headers['content-length'], 10);
        if (isNaN(contentLength)) { //this shouldn't happen, but it does
          return callback('Remote web server returned an invalid content length');
        }

        if (!validateFileSize(uploadOptions.maxFileSize, contentLength)) {
          return callback('File is too large. maxFileSize: ' + uploadOptions.maxFileSize + ', content-length: ' + contentLength);
        }

        //can we bail out early?
        if (uploadOptions.downloadFileName) {
          return callback(null, url, contentLength, uploadOptions.downloadFileName);
        }

        //no download specified, attempt to parse one out
        var file, ext, mimeExt;
        
        var contentType = res.headers['content-type'].split(';')[0];

        //attempt to get the filename from the url
        file = sanitizeFileName(path.basename(url.pathname));
        if (file) {
          ext = path.extname(file);
          file = file.replace(ext, '');
          ext = ext.replace('.', '');
          if (ext) {
            mimeExt = mimetypes.extension(contentType);
            if (mimeExt) {
              if (ext.toLowerCase() !== '.' + mimeExt.toLowerCase()) {
                ext = mimeExt;
              }
            }
          }
        }

        //default file name if we couldn't parse one
        if (!file) { file = 'poster'; }

        //default file extension if we cannot find one (unlikely)
        if (!ext) {
          ext = 'unk';
          if (contentType) {
            mimeExt = mimetypes.extension(contentType);
            if (mimeExt) {
              ext = mimeExt;
            }
          }
        }

        return callback(null, url, contentLength, file + '.' + ext);
      }
      catch (e) {
        callback(e);
      }
    });
    req.on('error', function(e) {
      callback(e);
    });
    req.end();
  }
  function parseUri(uri) {
    var uriRes = { host: null, path: uri, isValidUrl: false, protocol: null };
    var parsedUri = url.parse(uri);
    if ((parsedUri.protocol === 'http:') || (parsedUri.protocol === 'https:')) {
      uriRes.isValidUrl = true;
      uriRes.protocol = parsedUri.protocol;
      uriRes.path = parsedUri.path;
      uriRes.host = parsedUri.hostname;
      uriRes.port = parsedUri.port;
      uriRes.pathname = parsedUri.pathname;
    }

    return uriRes;
  }
  function getProtocol(url) {
    return (url.protocol === 'https:') ? https : http;
  }
  function getMultipartForm(fields, fileFieldName, fileName, fileContentType) {
    var form = '';
    if (fields) {
      for(var field in fields) {
        form += '--' + BOUNDRARY + '\r\n';
        form += 'Content-Disposition: form-data; name="' + field + '"\r\n\r\n';
        form += fields[field] + '\r\n';
      }
    }
    form += '--' + BOUNDRARY + '\r\n';
    form += 'Content-Disposition: form-data; name="' + fileFieldName + '"; filename="' + fileName + '"\r\n';
    form += 'Content-Type: ' + fileContentType + '\r\n\r\n';

    return new Buffer(form);
  }
  function getRequestOptions(method, url, headers, agent) {
    var options = {
      method: method,
      host: url.host,
      path: url.path,
      port: url.port,
      headers: headers
    };
      
    //custom agent support
    if (agent) {
      options.agent = agent;
    }

    return options;
  }
  function validateFileSize(maxFileSize, fileSize) {
    if (maxFileSize > 0) {
      if (fileSize > maxFileSize) {
        return false;
      }
    }
    return true;
  }
  function sanitizeFileName(fileName) {
    var re = new RegExp('[\\/:"*?<>|]+', "mg");
    var sanitized = fileName.replace(re, '');
    return (sanitized.length > 0) ? sanitized : null;
  }
  return {
    post: function(uri, options, callback) {
      if (!uri) return callback('Invalid url or file path argument');
      if (!options) return callback('Invalid options argument');
      if (!options.uploadUrl) return callback('Invalid upload url argument');
      
      var uploadUrl = parseUri(options.uploadUrl);
      if (!uploadUrl.isValidUrl) return callback('Invalid upload url argument');

      var uploadOptions = {
        method: 'POST',
        maxFileSize: 0,
        fileId: 'Filedata',
        maxRedirects: 5,
        fileContentType: 'application/octet-stream'
      };

      //set default upload options
      for (var attr in options) { uploadOptions[attr] = options[attr]; }
      
      //one agent to rule them all?
      if (options.agent) {
        options.downloadAgent = options.agent;
        options.uploadAgent = options.agent;
      }

      //one headers to rule them all?
      if (options.headers) {
        options.downloadHeaders = options.headers;
        options.uploadHeaders = options.headers;
      }

      //lets do this
      try {
        var parsedUri = parseUri(uri);
        if (parsedUri.isValidUrl) {
          head(parsedUri, uploadOptions, 0, function(err, fileUrl, fileSize, fileName) {
            if (err) return callback(err);
            
            upload(uploadUrl, fileUrl, uploadOptions, fileSize, fileName, callback);
          });
        }
        else {
          fs.exists(uri, function(exists) {
            if (!exists) return callback('File does not exist on the file system.');
            fs.stat(uri, function(err, stats) {
              if (err) return callback(err);

              if (!validateFileSize(uploadOptions.maxFileSize, stats.size)) {
                return callback('File is too large, maxFileSize: ' + uploadOptions.maxFileSize + ', size: ' + stats.size);
              }

              var fileName = uploadOptions.fileName ? uploadOptions.fileName : path.basename(uri);
              upload(uploadUrl, parsedUri, uploadOptions, stats.size, fileName, callback);
            });
          });
        }
      }
      catch (e) {
        callback(e);
      }
    }
  };
})();

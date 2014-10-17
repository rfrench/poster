var poster = require('../index.js');
var http = require('http');
var assert = require('assert');
var crypto = require('crypto');
var formidable = require('formidable');
var path = require('path');
var server = http.createServer(function(req, res) {
  var md5hash = crypto.createHash('md5');
  var form = new formidable.IncomingForm();
  var fields = {};
  var file;

  //mutlipart parsing events
  form.on('field', function(field, value) {
    fields[field] = value;
  });
  form.on('end', function() {
    //validate fields
    for(var field in options.fields) {
      assert.ok(fields[field], field + ' is missing.');
      assert.strictEqual(fields[field], options.fields[field], field + ' value do not match.');
    }

    //validate file
    assert.strictEqual(file.filename, '43.gif');
    assert.strictEqual(file.mime, 'image/gif');
    assert.strictEqual(md5hash.digest('hex'), 'f837aa60b6fe83458f790db60d529fc9');

    //goodbye
    res.writeHead(200);
    res.end('{ "success": true }');
  });

  form.onPart = function(part) {
    if (part.filename) {
      file = part;
      part.on('data', function(buffer) {
        md5hash.update(buffer);
      });
    }
    else {
      form.handlePart(part);
    }
  };
  form.parse(req);
});

var options = {
  uploadUrl: 'http://localhost:8080',
  method: 'POST',
  fileId: 'file',
  fileContentType: 'image/gif',
  fields: {
    'myfield': 'value',
    'myfield2': 'value2'
  }
};

//start listening
server.listen(8080, function() {
  //upload remote file
  poster.post(__dirname + '/file/43.gif', options, function(err, data) {
    server.close();
    if (err) {
      throw new Error(err);
    }

    //validate response
    var json = JSON.parse(data);
    assert.equal(json.success, true);
  });
});
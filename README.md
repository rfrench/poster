# poster
Async node module for uploading local/remote files over multipart.

## Install
<pre>
  $ npm install poster
</pre>

## post(uri, options, callback[err, data])

### Options
 - `uploadUrl`: Upload URL. (required)
 - `method`: HTTP method type. Defaults to `POST`.
 - `fileId`: File ID parameter name of the file. Defaults to `Filedata`.
 - `fields`: Optional form parameters.
 - `maxFileSize`: Maximum file size allowed to be uploaded in bytes. Disabled by default.
 - `fileContentType`: Content type of the file being uploaded. Defaults to 'application/octet-stream'.
 - `downloadFileName`: If supplied, this will override the parsed file name from the url.
 - `maxRedirects`: Total # of redirects allowed before giving up downloading the file. Defaults to `5`.
 - `downloadHeaders`: If supplied, these headers will be sent when downloading the file.
 - `uploadHeaders`: If supplied, these headers will be sent when uploading the file.
 - `headers`: If supplied, these headers will be sent for both downloading and uploading.
 - `downloadAgent`: Use your own http.Agent for downloading files. Defaults to the global agent.
 - `uploadAgent`: Use your own http.Agent for uploading files. Defaults to the global agent.
 - `agent`: If supplied, this value will use the same agent for both the downloadAgent and uploadAgent.

## Examples

### Stream local file
``` js
var poster = require('poster');

var options = {
  uploadUrl: 'http://mysite.com/upload',
  method: 'POST',
  fileId: 'file',
  fileContentType: 'image/jpeg'
  fields: {
    'myfield': 'value',
    'myfield2': 'value2'
  }
};

poster.post('file.jpg', options, function(err, data) {
  if (!err) {
    console.log(data);
  }
});
```

### Stream remote file
``` js
var poster = require('poster');

var options = {
  uploadUrl: 'http://mysite.com/upload',
  method: 'POST',
  fileId: 'file',
  fields: {
    'myfield': 'value',
    'myfield2': 'value2'
  }
};

poster.post('https://www.google.com/logos/2012/addams11-hp.jpg', options, function(err, data) {
  if (!err) {
    console.log(data);
  }
});
```

## BYOA (Bring Your Own Agent)
<pre>
  $ npm install tunnel
</pre>

``` js
var poster = require('poster');
var tunnel = require('tunnel'); //only works with 0.6.11+
var proxyAgent = new tunnel.httpOverHttp({
  proxy: {
    host: 'myproxy.com',
    port: 80
  }
});

var options = {
  uploadUrl: 'http://mysite.com/upload',
  method: 'POST',
  fileId: 'file',
  fields: {
    'myfield': 'value',
    'myfield2': 'value2'
  },
  downloadAgent: proxyAgent
};

poster.post('https://www.google.com/logos/2012/addams11-hp.jpg', options, function(err, data) {
  if (!err) {
    console.log(data);
  }
});
```
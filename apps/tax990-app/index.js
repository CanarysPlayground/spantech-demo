const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'tax990-app';
const TAG = process.env.IMAGE_TAG || 'dev';

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    app: APP_NAME,
    tag: TAG,
    message: 'Deployed via GitHub Actions (migrated from Jenkins)',
    time: new Date().toISOString()
  }));
}).listen(PORT, () => console.log(`${APP_NAME} listening on ${PORT}`));

const crypto = require('crypto');

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

module.exports = {
  sha256,
};

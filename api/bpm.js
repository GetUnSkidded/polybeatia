module.exports = async function handler(req, res) {
  res.json({ status: 'ok', node: process.version });
};

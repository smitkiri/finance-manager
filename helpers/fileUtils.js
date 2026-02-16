const fs = require('fs');
const path = require('path');

const getArtifactsDir = () => {
  return '.artifacts';
};

const getFilePath = (filename) => {
  const artifactsDir = getArtifactsDir();
  return path.join(artifactsDir, filename);
};

const ensureArtifactsDir = () => {
  const artifactsDir = getArtifactsDir();
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const reportsDir = path.join(artifactsDir, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
};

module.exports = { getArtifactsDir, getFilePath, ensureArtifactsDir };

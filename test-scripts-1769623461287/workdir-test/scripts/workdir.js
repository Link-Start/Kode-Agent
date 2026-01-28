#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

console.log('Current directory:', process.cwd());

// 在当前工作目录创建测试文件
const testDir = './test-workspace';
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

const testFile = path.join(testDir, 'test.txt');
fs.writeFileSync(testFile, 'workspace test');

console.log('Created file in:', testDir);
console.log('File exists:', fs.existsSync(testFile));

// 清理
fs.unlinkSync(testFile);
fs.rmdirSync(testDir);
console.log('Workspace cleaned up');

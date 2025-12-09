#!/usr/bin/env node

/**
 * 测试简化后的 Kode CLI 功能
 */

const { spawn } = require('child_process');
const path = require('path');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试用例
const tests = [
  {
    name: '基础启动测试',
    command: ['bun', 'run', 'dev', '--version'],
    expectOutput: /\d+\.\d+\.\d+/,
    timeout: 5000
  },
  {
    name: '帮助命令测试',
    command: ['bun', 'run', 'dev', '--help'],
    expectOutput: /Usage: kode/,
    timeout: 5000
  },
  {
    name: '非交互模式测试',
    command: ['bun', 'run', 'dev', '-p', 'What is 2+2?'],
    expectOutput: /4|four/i,
    timeout: 15000
  },
  {
    name: '模型列表测试',
    command: ['bun', 'run', 'dev', '--models'],
    expectOutput: /Available models|claude|gpt/i,
    timeout: 5000
  }
];

// 运行单个测试
async function runTest(test) {
  return new Promise((resolve, reject) => {
    log(`\n▶ 测试: ${test.name}`, 'blue');

    const child = spawn(test.command[0], test.command.slice(1), {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        name: test.name,
        passed: false,
        error: `超时 (${test.timeout}ms)`,
        output: output
      });
    }, test.timeout);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const combinedOutput = output + errorOutput;

      if (test.expectOutput && !test.expectOutput.test(combinedOutput)) {
        resolve({
          name: test.name,
          passed: false,
          error: `输出不匹配期望模式`,
          output: combinedOutput.slice(0, 200)
        });
      } else if (test.expectExit !== undefined && code !== test.expectExit) {
        resolve({
          name: test.name,
          passed: false,
          error: `退出码不匹配: 期望 ${test.expectExit}, 实际 ${code}`,
          output: combinedOutput.slice(0, 200)
        });
      } else {
        resolve({
          name: test.name,
          passed: true,
          output: combinedOutput.slice(0, 200)
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        name: test.name,
        passed: false,
        error: err.message,
        output: output
      });
    });
  });
}

// 运行所有测试
async function runAllTests() {
  log('\n🧪 开始测试简化后的 Kode CLI\n', 'yellow');

  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);

    if (result.passed) {
      log(`  ✅ ${result.name}`, 'green');
    } else {
      log(`  ❌ ${result.name}: ${result.error}`, 'red');
      if (result.output) {
        console.log(`     输出: ${result.output.split('\n')[0]}`);
      }
    }
  }

  // 统计结果
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  log('\n' + '='.repeat(50), 'blue');
  log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`,
      failed === 0 ? 'green' : 'red');

  if (failed > 0) {
    log('失败的测试:', 'red');
    results.filter(r => !r.passed).forEach(r => {
      log(`  - ${r.name}: ${r.error}`, 'red');
    });
  }

  return failed === 0;
}

// 主函数
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    log(`\n错误: ${err.message}`, 'red');
    process.exit(1);
  });
}
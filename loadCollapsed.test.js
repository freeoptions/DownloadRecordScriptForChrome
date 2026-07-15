const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('D:/MyCodes/@UploadToGithub/DownloadRecord/DownloadRecord.user.js', 'utf8');
const match = source.match(/function loadCollapsed\(\) \{([\s\S]*?)\n  \}/);

if (!match) {
  throw new Error('未找到 loadCollapsed 函数');
}

const loadCollapsed = new Function('localStorage', 'COLLAPSED_KEY', `${match[1]}`);

test('页面初始化时始终默认收起插件面板', () => {
  assert.equal(
    loadCollapsed(
      {
        getItem() {
          return '0';
        },
      },
      'download-record:collapsed'
    ),
    true
  );

  assert.equal(
    loadCollapsed(
      {
        getItem() {
          return '1';
        },
      },
      'download-record:collapsed'
    ),
    true
  );
});

test('已记录页只展示博主分组，不渲染笔记明细展开逻辑', () => {
  assert.equal(source.includes('data-action="toggle-creator"'), false);
  assert.equal(source.includes('dr-group-list'), false);
  assert.equal(source.includes('expandedCreators'), false);
  assert.equal(source.includes('loadMoreExpandedGroups'), false);
  assert.equal(source.includes('notes: [],\n          downloadedCount'), false);
  assert.equal(source.includes('group.notes'), false);
  assert.equal(source.includes('继续下拉可自动加载剩余'), false);
});

import { expect, test } from '@playwright/test';

function jsonResponse(route, body, options = {}) {
  return route.fulfill({
    status: options.status || 200,
    contentType: 'application/json',
    headers: options.headers || {},
    body: JSON.stringify(body),
  });
}

function createAccessToken(payload = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    idx: 1,
    email: 'admin@fileinnout.local',
    role: 'ROLE_ADMIN',
    exp: now + 3600,
    ...payload,
  })).toString('base64url');
  return `${header}.${body}.signature`;
}

function createDriveFile({
  idx = 601,
  fileOriginName = 'contract-e2e.txt',
  fileFormat = 'txt',
  fileSize = 2048,
  contentType = 'text/plain',
  lockedFile = false,
  sharedFile = false,
  recipients = [],
  presignedDownloadUrl = 'https://download.invalid/contract-e2e.txt',
} = {}) {
  return {
    idx,
    fileOriginName,
    fileFormat,
    fileSize,
    nodeType: 'FILE',
    contentType,
    lastModifyDate: '2026-07-05T12:00:00Z',
    uploadDate: '2026-07-05T11:00:00Z',
    lockedFile,
    sharedFile,
    recipients,
    recipientCount: recipients.length,
    presignedDownloadUrl,
  };
}

function createDrivePage(file) {
  return {
    breadcrumbs: [],
    fileList: [file],
    totalPage: 1,
    totalCount: 1,
    currentPage: 0,
    currentSize: 1,
    availableExtensions: ['txt'],
  };
}

async function mockFileManagementApi(page) {
  let driveFile = createDriveFile();
  let shareEntries = [];
  let completedUploadNames = [];

  await page.route('https://upload.invalid/**', async (route) => route.fulfill({
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    },
    body: '',
  }));

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fallback();
    }

    const path = url.pathname.replace(/^\/api/, '') || '/';

    if (path === '/auth/reissue') {
      return jsonResponse(route, {}, { headers: { Authorization: `Bearer ${createAccessToken()}` } });
    }

    if (path === '/auth/oauth2/providers') {
      return jsonResponse(route, { providers: [] });
    }

    if (path === '/file/list/page') {
      return jsonResponse(route, createDrivePage(driveFile));
    }

    if (path === '/file/list') {
      return jsonResponse(route, [driveFile]);
    }

    if (path === '/file/storage/summary') {
      return jsonResponse(route, {
        planCode: 'ADMIN',
        adminAccount: true,
        shareEnabled: true,
        fileLockEnabled: true,
        maxUploadFileBytes: 10737418240,
        maxUploadCount: 30,
        providerCapacityBytes: 10737418240,
        providerUsedBytes: 2048,
        providerRemainingBytes: 10737416192,
        allocatedUserQuotaBytes: 10737418240,
        allocatedUserUsedBytes: 2048,
      });
    }

    if (path === '/file/upload' && request.method() === 'POST') {
      const uploadRequests = JSON.parse(request.postData() || '[]');
      const firstUpload = Array.isArray(uploadRequests) ? uploadRequests[0] : null;
      return jsonResponse(route, [{
        presignedUploadUrl: `https://upload.invalid/${firstUpload?.fileOriginName || 'upload-e2e.txt'}`,
        objectKey: `uploads/${firstUpload?.fileOriginName || 'upload-e2e.txt'}`,
        finalObjectKey: `uploads/${firstUpload?.fileOriginName || 'upload-e2e.txt'}`,
        partitioned: false,
        partitionCount: 1,
      }]);
    }

    if (path === '/file/upload/complete' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const fileOriginName = payload.fileOriginName || 'upload-e2e.txt';
      completedUploadNames = [fileOriginName];
      driveFile = createDriveFile({
        idx: 602,
        fileOriginName,
        fileSize: Number(payload.fileSize || 0),
        fileFormat: payload.fileFormat || 'txt',
        presignedDownloadUrl: `https://download.invalid/${fileOriginName}`,
      });
      return jsonResponse(route, { ok: true });
    }

    if (path === '/file/601/download-link') {
      return jsonResponse(route, { downloadUrl: 'https://download.invalid/contract-e2e.txt' });
    }

    if (path === '/file/share/601') {
      return jsonResponse(route, shareEntries);
    }

    if (path === '/group/overview') {
      return jsonResponse(route, {
        uncategorizedRelationships: [],
        groupDetails: [],
        groups: [],
      });
    }

    if (path === '/group/share/files' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const emails = Array.isArray(payload.emails) ? payload.emails.filter(Boolean) : [];
      shareEntries = emails.map((email, index) => ({
        shareIdx: index + 1,
        fileIdx: 601,
        fileOriginName: driveFile.fileOriginName,
        recipientEmail: email,
        recipientName: email.split('@')[0],
        permission: payload.permission || 'WRITE',
        createdAt: '2026-07-05T12:30:00Z',
        expiresAt: payload.expiresAt || null,
        downloadLimit: payload.downloadLimit || null,
        downloadCount: 0,
        passwordProtected: Boolean(payload.sharePassword),
      }));
      driveFile = createDriveFile({
        lockedFile: driveFile.lockedFile,
        sharedFile: shareEntries.length > 0,
        recipients: shareEntries.map((entry) => ({
          recipientEmail: entry.recipientEmail,
          recipientName: entry.recipientName,
          permission: entry.permission,
          sharedAt: entry.createdAt,
        })),
      });
      return jsonResponse(route, { pendingInvites: [] });
    }

    if (path === '/file/lock' && request.method() === 'PATCH') {
      const payload = JSON.parse(request.postData() || '{}');
      const ids = Array.isArray(payload.fileIdxList) ? payload.fileIdxList.map(String) : [];
      if (ids.includes('601')) {
        driveFile = createDriveFile({
          lockedFile: Boolean(payload.locked),
          sharedFile: driveFile.sharedFile,
          recipients: driveFile.recipients,
        });
      }
      return jsonResponse(route, { ok: true });
    }

    if (path === '/file/share/shared/list' || path === '/file/share/shared/pending' || path === '/file/share/sent/list') {
      return jsonResponse(route, []);
    }

    if (path === '/notification/list') {
      return jsonResponse(route, []);
    }

    if (path === '/notification/subscribe' || path === '/notification/unsubscribe') {
      return jsonResponse(route, { ok: true });
    }

    if (path === '/sse/connect') {
      return route.fulfill({ status: 204, body: '' });
    }

    return jsonResponse(route, {});
  });

  return {
    getSharedRecipient: () => shareEntries[0]?.recipientEmail || '',
    getCompletedUploadName: () => completedUploadNames[0] || '',
    isLocked: () => Boolean(driveFile.lockedFile),
  };
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test.describe('file management flow', () => {
  test('downloads a file from the home drive', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fileInNOutDownloadClick = null;
      HTMLAnchorElement.prototype.click = function click() {
        window.__fileInNOutDownloadClick = {
          href: this.href,
          download: this.download,
        };
      };
    });
    await mockFileManagementApi(page);

    await page.goto('/main/home');

    const fileRow = page.locator('tr', { hasText: 'contract-e2e.txt' });
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('button', { name: '다운로드' }).click();

    await expect.poll(() => page.evaluate(() => window.__fileInNOutDownloadClick?.download || '')).toBe('contract-e2e.txt');
    await expect.poll(() => page.evaluate(() => window.__fileInNOutDownloadClick?.href || '')).toContain('/contract-e2e.txt');
  });

  test('uploads a file from the sidebar upload widget', async ({ page }) => {
    const apiState = await mockFileManagementApi(page);

    await page.goto('/main/home');

    await page.getByRole('button', { name: '업로드 / 폴더 만들기' }).click();
    const fileInput = page.locator('label', { hasText: '파일 업로드' }).locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'upload-e2e.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('upload e2e content'),
    });

    await expect.poll(() => apiState.getCompletedUploadName()).toBe('upload-e2e.txt');
    await expect(page.getByText('항목 1개 업로드 완료')).toBeVisible();
    await expect(page.locator('tr', { hasText: 'upload-e2e.txt' })).toBeVisible();
  });

  test('shares a selected file from the home drive', async ({ page }) => {
    const apiState = await mockFileManagementApi(page);

    await page.goto('/main/home');

    const fileRow = page.locator('tr', { hasText: 'contract-e2e.txt' });
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('checkbox').check();
    await expect(page.getByText('1개 선택됨')).toBeVisible();

    await page.getByRole('button', { name: '선택 공유' }).click();
    await expect(page.getByText('파일/폴더 공유')).toBeVisible();

    await page.getByPlaceholder('공유할 상대의 이메일').fill('recipient-e2e@fileinnout.local');
    await page.getByRole('button', { name: '공유 적용' }).click();

    await expect.poll(() => apiState.getSharedRecipient()).toBe('recipient-e2e@fileinnout.local');
    await expect(page.getByText('recipient-e2e@fileinnout.local')).toBeVisible();
    await expect(page.getByText('권한: 전체 허용')).toBeVisible();
  });

  test('locks a selected file from the home drive', async ({ page }) => {
    const apiState = await mockFileManagementApi(page);

    await page.goto('/main/home');

    const fileRow = page.locator('tr', { hasText: 'contract-e2e.txt' });
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: '선택 잠금' })).toBeVisible();

    await page.getByRole('button', { name: '선택 잠금' }).click();

    await expect.poll(() => apiState.isLocked()).toBe(true);
    await expect(fileRow.getByText('잠금', { exact: true })).toBeVisible();
  });

  test('locks and unlocks a selected file from the home drive', async ({ page }) => {
    const apiState = await mockFileManagementApi(page);

    await page.goto('/main/home');

    const fileRow = page.locator('tr', { hasText: 'contract-e2e.txt' });
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('checkbox').check();

    await page.getByRole('button', { name: '\uC120\uD0DD \uC7A0\uAE08' }).click();
    await expect.poll(() => apiState.isLocked()).toBe(true);
    await expect(fileRow.locator('.status-pill--locked')).toBeVisible();

    await page.getByRole('button', { name: '\uC7A0\uAE08 \uD574\uC81C' }).click();
    await expect.poll(() => apiState.isLocked()).toBe(false);
    await expect(fileRow.locator('.status-pill--locked')).toHaveCount(0);
  });
});

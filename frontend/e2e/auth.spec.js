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
function createAdministratorDashboard(accountStatus = 'ACTIVE') {
  return {
    summary: {
      totalUserCount: 1,
      activeUserCount: accountStatus === 'ACTIVE' ? 1 : 0,
      suspendedUserCount: accountStatus === 'SUSPENDED' ? 1 : 0,
      bannedUserCount: accountStatus === 'BANNED' ? 1 : 0,
      totalUsedBytes: 1073741824,
      totalFileCount: 6,
      totalFolderCount: 2,
      overallUsagePercent: 10,
    },
    users: [{
      idx: 10,
      id: 'e2e-user@fileinnout.local',
      name: 'E2E User',
      role: 'USER',
      accountStatus,
      planLabel: 'Free',
      usedBytes: 1073741824,
      usagePercent: 10,
      fileCount: 6,
      folderCount: 2,
      sharedFileCount: 1,
    }],
    planStats: [{
      planCode: 'FREE',
      planLabel: 'Free',
      userCount: 1,
      userPercent: 100,
      usedBytes: 1073741824,
      quotaBytes: 10737418240,
      usagePercent: 10,
    }],
  };
}

const ADMIN_STORAGE_ANALYTICS = {
  window: { rangeCode: '24H', rangeLabel: '24시간' },
  summary: {
    providerCapacityBytes: 10737418240,
    providerUsedBytes: 1073741824,
    providerRemainingBytes: 9663676416,
    providerUsagePercent: 10,
    allocatedUserQuotaBytes: 10737418240,
    allocatedUserUsedBytes: 1073741824,
    totalIngressBytes: 536870912,
    totalEgressBytes: 268435456,
    completedIngressBytes: 402653184,
    canceledIngressBytes: 134217728,
  },
  storageBreakdown: [
    { type: 'document', storedBytes: 671088640 },
    { type: 'image', storedBytes: 402653184 },
  ],
  transferBreakdown: [
    { direction: 'IN', label: '업로드', bytes: 536870912 },
    { direction: 'OUT', label: '다운로드', bytes: 268435456 },
  ],
  users: [{
    id: 'e2e-user@fileinnout.local',
    quotaBytes: 10737418240,
    currentStoredBytes: 1073741824,
    totalIngressBytes: 536870912,
    completedIngressBytes: 402653184,
    canceledIngressBytes: 134217728,
    totalEgressBytes: 268435456,
  }],
};

const ADMIN_SHARE_AUDIT = [{
  idx: 1,
  action: 'CREATED',
  actorIdx: 1,
  actorEmail: 'admin@fileinnout.local',
  ownerEmail: 'owner@fileinnout.local',
  recipientEmail: 'recipient@fileinnout.local',
  fileIdx: 9,
  fileName: 'admin-e2e.txt',
  createdAt: '2026-07-05T12:00:00Z',
}];

const ADMIN_SESSIONS = [{
  sessionId: 'session-e2e',
  userIdx: 10,
  email: 'e2e-user@fileinnout.local',
  name: 'E2E User',
  role: 'USER',
  accountStatus: 'ACTIVE',
  enabled: true,
  expired: false,
  createdAt: '2026-07-05T12:00:00Z',
  updatedAt: '2026-07-05T12:10:00Z',
  expiresAt: '2026-07-05T13:00:00Z',
}];

async function mockApi(page, { loginToken = createAccessToken(), refreshToken = null, oauthProviders = [] } = {}) {
  let adminUserStatus = 'ACTIVE';
  let adminSessions = ADMIN_SESSIONS.map((session) => ({ ...session }));

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      return route.fallback();
    }
    const path = url.pathname.replace(/^\/api/, '') || '/';

    if (path === '/auth/oauth2/providers') {
      return jsonResponse(route, { adminOnly: false, providers: oauthProviders });
    }

    if (path === '/auth/reissue') {
      if (!refreshToken) {
        return jsonResponse(route, { message: 'refresh required' }, { status: 401 });
      }
      return jsonResponse(route, {}, { headers: { Authorization: `Bearer ${refreshToken}` } });
    }

    if (path === '/login' && request.method() === 'POST') {
      return jsonResponse(route, {}, { headers: { Authorization: `Bearer ${loginToken}` } });
    }

    if (path === '/administrator/dashboard') {
      return jsonResponse(route, createAdministratorDashboard(adminUserStatus));
    }

    if (path === '/administrator/users/10/status' && request.method() === 'PATCH') {
      const payload = JSON.parse(request.postData() || '{}');
      adminUserStatus = payload.accountStatus || adminUserStatus;
      return jsonResponse(route, createAdministratorDashboard(adminUserStatus).users[0]);
    }

    if (path === '/administrator/storage-analytics') {
      return jsonResponse(route, ADMIN_STORAGE_ANALYTICS);
    }

    if (path === '/administrator/share-audit') {
      return jsonResponse(route, ADMIN_SHARE_AUDIT);
    }

    if (path === '/administrator/sessions' && request.method() === 'GET') {
      return jsonResponse(route, adminSessions);
    }

    if (path === '/administrator/sessions/session-e2e' && request.method() === 'DELETE') {
      adminSessions = adminSessions.filter((session) => session.sessionId !== 'session-e2e');
      return jsonResponse(route, { ok: true });
    }

    if (path === '/administrator/users/10/sessions' && request.method() === 'DELETE') {
      adminSessions = adminSessions.filter((session) => session.userIdx !== 10);
      return jsonResponse(route, { ok: true });
    }

    if (path === '/file/storage/summary') {
      return jsonResponse(route, {
        providerCapacityBytes: 10737418240,
        providerUsedBytes: 0,
        providerRemainingBytes: 10737418240,
        allocatedUserQuotaBytes: 1073741824,
        allocatedUserUsedBytes: 0,
      });
    }

    if (path === '/file/list' || path === '/file/share/shared/list' || path === '/file/share/shared/pending') {
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
    getAdminUserStatus: () => adminUserStatus,
    getAdminSessionCount: () => adminSessions.length,
  };
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test.describe('authentication flow', () => {
  test('redirects protected routes to login when refresh fails', async ({ page }) => {
    await mockApi(page);

    await page.goto('/main/home');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('shows configured social login providers and starts the OAuth flow', async ({ page }) => {
    await mockApi(page, {
      oauthProviders: [
        { id: 'google', label: 'Google', enabled: true, authorizationUrl: '/oauth2/authorization/google' },
        { id: 'kakao', label: 'Kakao', enabled: false },
        { id: 'naver', label: 'Naver', enabled: false },
      ],
    });

    await page.goto('/login');

    const googleButton = page.locator('.provider-google');
    await expect(googleButton).toBeEnabled();
    await expect(page.locator('.provider-kakao')).toBeDisabled();
    await expect(page.locator('.provider-naver')).toBeDisabled();

    await googleButton.click();

    await expect(page).toHaveURL(/\/api\/oauth2\/authorization\/google$/);
  });

  test('logs in with the administrator form and opens the main area', async ({ page }) => {
    const accessToken = createAccessToken();
    await mockApi(page, {
      loginToken: accessToken,
      refreshToken: accessToken,
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    const passwordInput = page.getByPlaceholder('Administrator password');
    await passwordInput.fill('AdminPassword1!');
    await expect(passwordInput).toHaveValue('AdminPassword1!');
    const signInButton = page.getByRole('button', { name: 'Sign in' });
    await expect(signInButton).toBeEnabled();
    await signInButton.click();

    await expect(page).toHaveURL(/\/main\/home$/);
    await expect(page.getByText('홈').first()).toBeVisible();
  });

  test('redirects non-administrator sessions away from the administrator page', async ({ page }) => {
    await mockApi(page, {
      refreshToken: createAccessToken({
        email: 'user@fileinnout.local',
        role: 'ROLE_USER',
      }),
    });

    await page.goto('/main/administrator');

    await expect(page).toHaveURL(/\/main\/home$/);
    await expect(page.getByText('홈').first()).toBeVisible();
  });

  test('loads the administrator dashboard and updates a user status', async ({ page }) => {
    const adminApi = await mockApi(page, {
      refreshToken: createAccessToken(),
    });

    await page.goto('/main/administrator');

    await expect(page).toHaveURL(/\/main\/administrator$/);
    await expect(page.getByRole('heading', { name: '관리자 페이지' })).toBeVisible();

    const userRow = page.locator('tr', { hasText: 'e2e-user@fileinnout.local' });
    await expect(userRow.getByText('ACTIVE')).toBeVisible();
    await userRow.getByRole('button', { name: '정지' }).click();
    await expect.poll(() => adminApi.getAdminUserStatus()).toBe('SUSPENDED');
    await expect(userRow.getByText('SUSPENDED')).toBeVisible();

    await page.getByRole('button', { name: '스토리지 통계 및 분석' }).click();
    await expect(page.getByRole('heading', { name: '스토리지 통계 및 분석' })).toBeVisible();
    await expect(page.getByText('서비스 총 용량', { exact: true })).toBeVisible();
  });

  test('loads administrator audit logs and force logs out a session', async ({ page }) => {
    const adminApi = await mockApi(page, {
      refreshToken: createAccessToken(),
    });

    await page.goto('/main/administrator');

    await page.getByRole('button', { name: '공유 감사 로그' }).click();
    await expect(page.getByRole('heading', { name: '공유 감사 로그' })).toBeVisible();
    const auditRow = page.locator('tr', { hasText: 'admin-e2e.txt' });
    await expect(auditRow.getByText('공유 생성')).toBeVisible();
    await expect(auditRow.getByText('recipient@fileinnout.local')).toBeVisible();

    await page.getByRole('button', { name: '세션 관리' }).click();
    await expect(page.getByRole('heading', { name: '세션 관리' })).toBeVisible();
    const sessionRow = page.locator('tr', { hasText: 'session-e2e' });
    await expect(sessionRow.getByText('e2e-user@fileinnout.local')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await sessionRow.getByRole('button', { name: '세션 종료' }).click();

    await expect.poll(() => adminApi.getAdminSessionCount()).toBe(0);
    await expect(page.getByText('현재 등록된 세션이 없습니다.')).toBeVisible();
  });
});
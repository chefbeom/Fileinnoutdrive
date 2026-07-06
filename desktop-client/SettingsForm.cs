using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace FileInNOutDesktop
{
    internal sealed partial class SettingsForm : Form
    {
        private readonly TrayController controller;
        private readonly Panel contentPanel;
        private Label subtitleLabel;
        private Label storageUsageLabel;
        private Label storageRemainLabel;
        private Label storagePlanLabel;
        private SmoothProgress storageProgress;
        private TextBox emailText;
        private TextBox passwordText;
        private TextBox localFolderText;
        private TextBox cloudFolderText;
        private TextBox shareEmailText;
        private TextBox sharedAddressText;
        private TextBox searchText;
        private ComboBox directionCombo;
        private ComboBox permissionCombo;
        private TextBox statusText;
        private ListView folderList;
        private ListView pendingShareList;
        private ListView fileList;
        private System.Windows.Forms.Timer searchRefreshTimer;
        private CheckBox notificationsCheck;
        private CheckBox autoSyncCheck;
        private bool rebuilding;

        public SettingsForm(TrayController controller)
        {
            this.controller = controller;
            Text = "FileInNOut 데스크톱";
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "FileInNOut \uB370\uC2A4\uD06C\uD1B1";
            Width = 980;
            Height = 780;
            MinimumSize = new Size(900, 700);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = AppColors.Background;
            Font = new Font("Malgun Gothic", 9F, FontStyle.Regular);
            DoubleBuffered = true;
            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "FileInNOutDesktop.ico");
            if (File.Exists(iconPath))
            {
                Icon = new Icon(iconPath);
            }

            searchRefreshTimer = new System.Windows.Forms.Timer();
            searchRefreshTimer.Interval = 450;
            searchRefreshTimer.Tick += delegate
            {
                searchRefreshTimer.Stop();
                RefreshRecentFiles();
            };
            Disposed += delegate
            {
                if (searchRefreshTimer != null)
                {
                    searchRefreshTimer.Dispose();
                }
            };

            contentPanel = new BufferedPanel();
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.BackColor = AppColors.Background;
            contentPanel.AutoScroll = true;
            Controls.Add(contentPanel);

            FormClosing += delegate(object sender, FormClosingEventArgs e)
            {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    Hide();
                }
            };
        }

        public void RefreshAll()
        {
            if (rebuilding)
            {
                return;
            }
            rebuilding = true;
            try
            {
                contentPanel.SuspendLayout();
                contentPanel.Controls.Clear();
                ResetDashboardReferences();
                DesktopConfig config = controller.LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken))
            {
                BuildLogin(config);
            }
                else
                {
                    BuildDashboard(config);
                }
            }
            finally
            {
                contentPanel.ResumeLayout(true);
                rebuilding = false;
            }
        }

        public void RefreshLiveData()
        {
            if (rebuilding || IsDisposed)
            {
                return;
            }
            if (InvokeRequired)
            {
                BeginInvoke(new MethodInvoker(RefreshLiveData));
                return;
            }

            DesktopConfig config = controller.LoadDesktopConfig();
            if (String.IsNullOrWhiteSpace(config.RefreshToken) || statusText == null || fileList == null)
            {
                RefreshAll();
                return;
            }

            UpdateHeader(config);
            RefreshStorage();
            RefreshPendingShares();
            RefreshStatus();
            RefreshFolderStatuses();
            RefreshRecentFiles();
            if (autoSyncCheck != null && autoSyncCheck.Checked != controller.AutoSyncEnabled)
            {
                autoSyncCheck.Checked = controller.AutoSyncEnabled;
            }
            if (notificationsCheck != null && notificationsCheck.Checked != controller.NotificationsEnabled)
            {
                notificationsCheck.Checked = controller.NotificationsEnabled;
            }
        }

        private void BuildLogin(DesktopConfig config)
        {
            Panel shell = new Panel();
            shell.Dock = DockStyle.Fill;
            shell.BackColor = AppColors.Background;
            contentPanel.Controls.Add(shell);

            RoundedPanel card = new RoundedPanel();
            card.BackColor = Color.White;
            card.Radius = 8;
            card.Width = 430;
            card.Height = 320;
            card.Anchor = AnchorStyles.None;
            card.Left = (shell.Width - card.Width) / 2;
            card.Top = (shell.Height - card.Height) / 2;
            card.Resize += delegate
            {
                card.Left = (shell.Width - card.Width) / 2;
                card.Top = (shell.Height - card.Height) / 2;
            };
            shell.Resize += delegate
            {
                card.Left = (shell.Width - card.Width) / 2;
                card.Top = (shell.Height - card.Height) / 2;
            };
            shell.Controls.Add(card);

            Label title = DesktopUiControls.CreateLabel("FileInNOut Desktop", 18, FontStyle.Bold, AppColors.Text);
            title.SetBounds(28, 26, 360, 32);
            card.Controls.Add(title);

            Label cloud = DesktopUiControls.CreateLabel("FileInNOut Cloud에 로그인", 9, FontStyle.Regular, AppColors.Muted);
            cloud.SetBounds(30, 60, 250, 24);
            cloud.Text = "FileInNOut Cloud\uC5D0 \uB85C\uADF8\uC778";
            card.Controls.Add(cloud);

            Label emailLabel = DesktopUiControls.CreateLabel("아이디 또는 이메일", 9, FontStyle.Bold, AppColors.Muted);
            emailLabel.SetBounds(30, 90, 360, 20);
            emailLabel.Text = "\uC544\uC774\uB514 \uB610\uB294 \uC774\uBA54\uC77C";
            card.Controls.Add(emailLabel);

            emailText = DesktopUiControls.CreateTextBox();
            emailText.Text = config.Email;
            emailText.SetBounds(30, 112, 370, 34);
            card.Controls.Add(emailText);

            Label passwordLabel = DesktopUiControls.CreateLabel("비밀번호", 9, FontStyle.Bold, AppColors.Muted);
            passwordLabel.SetBounds(30, 156, 360, 20);
            passwordLabel.Text = "\uBE44\uBC00\uBC88\uD638";
            card.Controls.Add(passwordLabel);

            passwordText = DesktopUiControls.CreateTextBox();
            passwordText.UseSystemPasswordChar = true;
            passwordText.SetBounds(30, 178, 330, 34);
            card.Controls.Add(passwordText);

            RoundedButton showButton = DesktopUiControls.CreateButton("보기");
            showButton.SetBounds(366, 178, 54, 34);
            showButton.Text = "\uBCF4\uAE30";
            showButton.Click += delegate { passwordText.UseSystemPasswordChar = !passwordText.UseSystemPasswordChar; };
            card.Controls.Add(showButton);

            CheckBox keepLogin = DesktopUiControls.CreateCheckBox("로그인 상태 유지", true);
            keepLogin.SetBounds(30, 226, 180, 24);
            card.Controls.Add(keepLogin);

            Label ipSecurity = DesktopUiControls.CreateLabel("IP보안 OFF", 9, FontStyle.Bold, AppColors.Muted);
            ipSecurity.TextAlign = ContentAlignment.MiddleRight;
            ipSecurity.Text = "IP\uBCF4\uC548 OFF";
            ipSecurity.SetBounds(285, 226, 115, 24);
            card.Controls.Add(ipSecurity);

            RoundedButton loginButton = DesktopUiControls.CreateButton("\uB85C\uADF8\uC778", true);
            loginButton.SetBounds(30, 260, 370, 44);
            loginButton.Click += delegate { DoLogin(); };
            card.Controls.Add(loginButton);
            AcceptButton = loginButton;
        }

        private void BuildDashboard(DesktopConfig config)
        {
            TableLayoutPanel main = new TableLayoutPanel();
            main.Dock = DockStyle.Fill;
            main.Padding = new Padding(18);
            main.BackColor = AppColors.Background;
            main.ColumnCount = 1;
            main.RowCount = 5;
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 300));
            main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            contentPanel.Controls.Add(main);

            main.Controls.Add(BuildHeader(config), 0, 0);
            main.Controls.Add(BuildStorageCard(), 0, 1);
            main.Controls.Add(BuildPendingShareCard(), 0, 2);
            main.Controls.Add(BuildFolderCard(config), 0, 3);
            main.Controls.Add(BuildBottomArea(), 0, 4);
        }

        private Control BuildHeader(DesktopConfig config)
        {
            TableLayoutPanel header = new TableLayoutPanel();
            header.Dock = DockStyle.Fill;
            header.BackColor = AppColors.Background;
            header.ColumnCount = 2;
            header.RowCount = 1;
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 380));

            TableLayoutPanel copy = new TableLayoutPanel();
            copy.Dock = DockStyle.Fill;
            copy.RowCount = 2;
            copy.ColumnCount = 1;
            copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));

            Label title = DesktopUiControls.CreateLabel("FileInNOut Desktop", 20, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            copy.Controls.Add(title, 0, 0);
            subtitleLabel = DesktopUiControls.CreateLabel("", 9, FontStyle.Regular, AppColors.Muted);
            subtitleLabel.Dock = DockStyle.Fill;
            copy.Controls.Add(subtitleLabel, 0, 1);
            UpdateHeader(config);
            header.Controls.Add(copy, 0, 0);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.Dock = DockStyle.Fill;
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.WrapContents = false;
            buttons.Padding = new Padding(0, 13, 0, 0);

            RoundedButton webButton = DesktopUiControls.CreateButton("웹 열기");
            webButton.Size = new Size(102, 36);
            webButton.Text = "\uC6F9 \uC5F4\uAE30";
            webButton.Margin = new Padding(8, 0, 0, 0);
            webButton.Click += delegate { controller.OpenWeb(); };

            RoundedButton pauseButton = DesktopUiControls.CreateButton(controller.AutoSyncEnabled ? "동기화 일시정지" : "동기화 재개");
            pauseButton.Size = new Size(132, 36);
            pauseButton.Text = controller.AutoSyncEnabled ? "\uB3D9\uAE30\uD654 \uC77C\uC2DC\uC815\uC9C0" : "\uB3D9\uAE30\uD654 \uC7AC\uAC1C";
            pauseButton.Margin = new Padding(8, 0, 0, 0);
            pauseButton.Click += delegate { controller.ToggleAutoSync(); RefreshLiveData(); };

            RoundedButton logoutButton = DesktopUiControls.CreateButton("로그아웃");
            logoutButton.Size = new Size(96, 36);
            logoutButton.Text = "\uB85C\uADF8\uC544\uC6C3";
            logoutButton.Margin = new Padding(8, 0, 0, 0);
            logoutButton.Click += delegate { controller.Logout(); RefreshAll(); };
            buttons.Controls.Add(logoutButton);
            buttons.Controls.Add(webButton);
            buttons.Controls.Add(pauseButton);
            header.Controls.Add(buttons, 1, 0);

            return header;
        }

        private Control BuildStorageCard()
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 16, 20, 16);

            StorageSummary summary = controller.GetStorageSummary();
            SettingsStorageSummaryText summaryText = DesktopSettingsText.BuildStorageSummary(summary, DesktopSyncText.UseKoreanLabels());
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.RowCount = 3;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            card.Controls.Add(layout);

            Label title = DesktopUiControls.CreateLabel("드라이브 용량", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            layout.Controls.Add(title, 0, 0);

            storageUsageLabel = DesktopUiControls.CreateLabel(summaryText.UsageText, 18, FontStyle.Bold, AppColors.PrimaryDark);
            storageUsageLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storageUsageLabel, 0, 1);
            layout.SetRowSpan(storageUsageLabel, 2);

            storageRemainLabel = DesktopUiControls.CreateLabel(summaryText.RemainingText, 9, FontStyle.Regular, AppColors.Muted);
            storageRemainLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storageRemainLabel, 1, 0);

            storageProgress = new SmoothProgress();
            storageProgress.Value = summaryText.ProgressValue;
            storageProgress.Dock = DockStyle.Fill;
            storageProgress.Margin = new Padding(0, 12, 0, 12);
            layout.Controls.Add(storageProgress, 1, 1);
            storagePlanLabel = DesktopUiControls.CreateLabel(summaryText.PlanText, 9, FontStyle.Regular, AppColors.Muted);
            storagePlanLabel.Dock = DockStyle.Fill;
            layout.Controls.Add(storagePlanLabel, 1, 2);
            ApplyStorageSummary(summary);

            return card;
        }

        private Control BuildPendingShareCard()
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 14, 20, 14);

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.RowCount = 3;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            card.Controls.Add(layout);

            Label title = DesktopUiControls.CreateLabel("공유 초대", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            layout.Controls.Add(title, 0, 0);

            Label hint = DesktopUiControls.CreateLabel("수락하면 공유 폴더가 동기화 대상에 포함됩니다.", 8, FontStyle.Regular, AppColors.Muted);
            hint.Dock = DockStyle.Fill;
            hint.TextAlign = ContentAlignment.MiddleRight;
            layout.Controls.Add(hint, 1, 0);

            sharedAddressText = DesktopUiControls.CreateTextBox();
            sharedAddressText.Dock = DockStyle.Fill;
            sharedAddressText.Margin = new Padding(0, 2, 8, 6);
            layout.Controls.Add(sharedAddressText, 0, 1);

            RoundedButton openAddressButton = DesktopUiControls.CreateButton("\uC8FC\uC18C \uC5F4\uAE30");
            openAddressButton.Dock = DockStyle.Fill;
            openAddressButton.Margin = new Padding(12, 2, 0, 6);
            openAddressButton.Click += delegate { OpenSharedAddress(); };
            layout.Controls.Add(openAddressButton, 1, 1);

            pendingShareList = DesktopUiControls.CreateDetailsListView();
            pendingShareList.Columns.Add("공유 폴더/파일", 340);
            pendingShareList.Columns.Add("보낸 사람", 230);
            pendingShareList.Columns.Add("권한", 120);
            layout.Controls.Add(pendingShareList, 0, 2);

            TableLayoutPanel actions = new TableLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.ColumnCount = 1;
            actions.RowCount = 3;
            actions.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            actions.Margin = new Padding(12, 0, 0, 0);
            layout.Controls.Add(actions, 1, 2);

            RoundedButton acceptButton = DesktopUiControls.CreateButton("수락", true);
            acceptButton.Dock = DockStyle.Fill;
            acceptButton.Margin = new Padding(0, 0, 0, 6);
            acceptButton.Click += delegate { AcceptSelectedPendingShare(); };
            actions.Controls.Add(acceptButton, 0, 1);

            RoundedButton rejectButton = DesktopUiControls.CreateButton("거절");
            rejectButton.Dock = DockStyle.Fill;
            rejectButton.Margin = new Padding(0);
            rejectButton.Click += delegate { RejectSelectedPendingShare(); };
            actions.Controls.Add(rejectButton, 0, 2);

            RefreshPendingShares();
            return card;
        }

        private Control BuildFolderCard(DesktopConfig config)
        {
            RoundedPanel card = new RoundedPanel();
            card.Dock = DockStyle.Fill;
            card.Margin = new Padding(0, 0, 0, 14);
            card.Radius = 8;
            card.BackColor = Color.White;
            card.Padding = new Padding(20, 16, 20, 16);

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.ColumnCount = 2;
            root.RowCount = 2;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            card.Controls.Add(root);

            TableLayoutPanel left = new TableLayoutPanel();
            left.Dock = DockStyle.Fill;
            left.ColumnCount = 1;
            left.RowCount = 2;
            left.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            left.Margin = new Padding(0, 0, 16, 0);
            root.Controls.Add(left, 0, 0);

            Label title = DesktopUiControls.CreateLabel("동기화 폴더", 12, FontStyle.Bold, AppColors.Text);
            title.Dock = DockStyle.Fill;
            title.Text = "\uB3D9\uAE30\uD654 \uD3F4\uB354";
            left.Controls.Add(title, 0, 0);

            folderList = DesktopUiControls.CreateDetailsListView();
            folderList.Columns.Add("내 폴더", 145);
            folderList.Columns.Add("클라우드", 95);
            folderList.Columns.Add("방식", 95);
            folderList.Columns.Add("\uAD8C\uD55C", 92);
            folderList.Columns.Add("\uC0C1\uD0DC", 76);
            folderList.Columns[0].Text = "\uD3F4\uB354";
            folderList.Columns[1].Text = "\uD074\uB77C\uC6B0\uB4DC";
            folderList.Columns[2].Text = "\uBC29\uC2DD";
            foreach (SyncFolderConfig folder in config.SyncFolders)
            {
                if (!folder.Enabled)
                {
                    continue;
                }
                ListViewItem row = new ListViewItem(folder.LocalPath);
                row.Tag = folder;
                row.SubItems.Add(folder.RemotePath);
                row.SubItems.Add(DesktopSyncText.DirectionLabel(folder.Direction));
                row.SubItems.Add(controller.FolderPermissionLabel(folder));
                row.SubItems.Add(controller.FolderStatusLabel(folder));
                folderList.Items.Add(row);
            }
            folderList.SelectedIndexChanged += delegate { LoadSelectedFolder(); };
            left.Controls.Add(folderList, 0, 1);

            TableLayoutPanel form = new TableLayoutPanel();
            form.Dock = DockStyle.Fill;
            form.ColumnCount = 4;
            form.RowCount = 7;
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            root.Controls.Add(form, 1, 0);

            Label localLabel = DesktopUiControls.CreateLabel("내 폴더", 8, FontStyle.Bold, AppColors.Muted);
            localLabel.Dock = DockStyle.Fill;
            localLabel.Text = "\uD3F4\uB354";
            form.Controls.Add(localLabel, 0, 0);
            form.SetColumnSpan(localLabel, 4);

            localFolderText = DesktopUiControls.CreateTextBox();
            localFolderText.Dock = DockStyle.Fill;
            localFolderText.Margin = new Padding(0, 2, 8, 4);
            form.Controls.Add(localFolderText, 0, 1);
            form.SetColumnSpan(localFolderText, 3);

            RoundedButton browseButton = DesktopUiControls.CreateButton("찾아보기");
            browseButton.Dock = DockStyle.Fill;
            browseButton.Text = "\uCC3E\uC544\uBCF4\uAE30";
            browseButton.Margin = new Padding(0, 0, 0, 4);
            browseButton.Click += delegate { BrowseFolder(); };
            form.Controls.Add(browseButton, 3, 1);

            Label cloudLabel = DesktopUiControls.CreateLabel("클라우드 폴더", 8, FontStyle.Bold, AppColors.Muted);
            cloudLabel.Dock = DockStyle.Fill;
            cloudLabel.Text = "\uD074\uB77C\uC6B0\uB4DC \uD3F4\uB354";
            form.Controls.Add(cloudLabel, 0, 2);

            Label directionLabel = DesktopUiControls.CreateLabel("동기화 방식", 8, FontStyle.Bold, AppColors.Muted);
            directionLabel.Dock = DockStyle.Fill;
            directionLabel.Text = "\uB3D9\uAE30\uD654 \uBC29\uC2DD";
            form.Controls.Add(directionLabel, 1, 2);
            form.SetColumnSpan(directionLabel, 2);

            cloudFolderText = DesktopUiControls.CreateTextBox();
            cloudFolderText.Dock = DockStyle.Fill;
            cloudFolderText.Margin = new Padding(0, 2, 8, 4);
            form.Controls.Add(cloudFolderText, 0, 3);

            directionCombo = DesktopUiControls.CreateDropDown();
            directionCombo.Items.Add("양방향");
            directionCombo.Items.Add("내 폴더 -> 클라우드");
            directionCombo.Items.Add("클라우드 -> 내 폴더");
            directionCombo.Items.Clear();
            directionCombo.Items.Add("\uC591\uBC29\uD5A5");
            directionCombo.Items.Add("\uD3F4\uB354 -> \uD074\uB77C\uC6B0\uB4DC");
            directionCombo.Items.Add("\uD074\uB77C\uC6B0\uB4DC -> \uD3F4\uB354");
            directionCombo.Dock = DockStyle.Fill;
            directionCombo.Margin = new Padding(0, 2, 8, 4);
            directionCombo.SelectedIndex = 0;
            form.Controls.Add(directionCombo, 1, 3);
            form.SetColumnSpan(directionCombo, 2);

            RoundedButton saveButton = DesktopUiControls.CreateButton("저장", true);
            saveButton.Text = "\uC800\uC7A5";
            saveButton.Dock = DockStyle.Fill;
            saveButton.Margin = new Padding(0, 0, 0, 4);
            saveButton.Click += delegate { SaveFolder(); };
            form.Controls.Add(saveButton, 3, 3);

            RoundedButton syncButton = DesktopUiControls.CreateButton("지금 동기화", true);
            syncButton.Text = "\uC9C0\uAE08 \uB3D9\uAE30\uD654";
            syncButton.Dock = DockStyle.Fill;
            syncButton.Margin = new Padding(0, 6, 8, 4);
            syncButton.Click += delegate { controller.SyncNow(true); };
            form.Controls.Add(syncButton, 0, 4);

            RoundedButton openButton = DesktopUiControls.CreateButton("열기");
            openButton.Dock = DockStyle.Fill;
            openButton.Text = "\uC5F4\uAE30";
            openButton.Margin = new Padding(0, 6, 8, 4);
            openButton.Click += delegate { controller.OpenFolder(localFolderText.Text.Trim()); };
            form.Controls.Add(openButton, 1, 4);

            RoundedButton removeButton = DesktopUiControls.CreateButton("제거");
            removeButton.Dock = DockStyle.Fill;
            removeButton.Text = "\uC81C\uAC70";
            removeButton.Margin = new Padding(0, 6, 8, 4);
            removeButton.Click += delegate { RemoveFolder(); };
            form.Controls.Add(removeButton, 2, 4);

            RoundedButton newButton = DesktopUiControls.CreateButton("새 폴더");
            newButton.Dock = DockStyle.Fill;
            newButton.Text = "\uC0C8 \uD3F4\uB354";
            newButton.Margin = new Padding(0, 6, 0, 4);
            newButton.Click += delegate { NewFolder(); };
            form.Controls.Add(newButton, 3, 4);

            Label shareLabel = DesktopUiControls.CreateLabel("이메일로 공유", 8, FontStyle.Bold, AppColors.Muted);
            shareLabel.Dock = DockStyle.Fill;
            shareLabel.Text = "\uC774\uBA54\uC77C\uB85C \uACF5\uC720";
            form.Controls.Add(shareLabel, 0, 5);
            form.SetColumnSpan(shareLabel, 4);

            shareEmailText = DesktopUiControls.CreateTextBox();
            shareEmailText.Dock = DockStyle.Fill;
            shareEmailText.Margin = new Padding(0, 2, 8, 0);
            form.Controls.Add(shareEmailText, 0, 6);
            form.SetColumnSpan(shareEmailText, 2);

            permissionCombo = DesktopUiControls.CreateDropDown();
            permissionCombo.Items.Add("전체 허용");
            permissionCombo.Items.Add("보기만");
            permissionCombo.Items.Add("보기 + 다운로드");
            permissionCombo.Items.Add("업로드만");
            permissionCombo.Items.Clear();
            permissionCombo.Items.Add("\uC804\uCCB4 \uD5C8\uC6A9");
            permissionCombo.Items.Add("\uBCF4\uAE30\uB9CC");
            permissionCombo.Items.Add("\uBCF4\uAE30 + \uB2E4\uC6B4\uB85C\uB4DC");
            permissionCombo.Items.Add("\uC5C5\uB85C\uB4DC\uB9CC");
            permissionCombo.SelectedIndex = 0;
            permissionCombo.Dock = DockStyle.Fill;
            permissionCombo.Margin = new Padding(0, 2, 8, 0);
            form.Controls.Add(permissionCombo, 2, 6);

            RoundedButton shareButton = DesktopUiControls.CreateButton("공유");
            shareButton.Dock = DockStyle.Fill;
            shareButton.Text = "\uACF5\uC720";
            shareButton.Margin = new Padding(0, 0, 0, 0);
            shareButton.Click += delegate { ShareFolder(); };
            form.Controls.Add(shareButton, 3, 6);

            FlowLayoutPanel options = new FlowLayoutPanel();
            options.Dock = DockStyle.Fill;
            options.FlowDirection = FlowDirection.LeftToRight;
            options.WrapContents = false;
            options.Margin = new Padding(0);
            options.Padding = new Padding(0, 4, 0, 0);
            root.Controls.Add(options, 0, 1);
            root.SetColumnSpan(options, 2);

            autoSyncCheck = DesktopUiControls.CreateCheckBox("파일 변경 및 20초마다 자동 동기화", controller.AutoSyncEnabled);
            autoSyncCheck.Margin = new Padding(0, 0, 22, 0);
            autoSyncCheck.CheckedChanged += delegate
            {
                if (autoSyncCheck.Checked != controller.AutoSyncEnabled)
                {
                    controller.ToggleAutoSync();
                }
            };
            options.Controls.Add(autoSyncCheck);

            notificationsCheck = DesktopUiControls.CreateCheckBox("파일 변경이 있을 때만 알림", controller.NotificationsEnabled);
            notificationsCheck.CheckedChanged += delegate { controller.SetNotifications(notificationsCheck.Checked); };
            options.Controls.Add(notificationsCheck);

            if (folderList.Items.Count > 0)
            {
                folderList.Items[0].Selected = true;
                LoadSelectedFolder();
            }

            return card;
        }

        private Control BuildBottomArea()
        {
            TableLayoutPanel area = new TableLayoutPanel();
            area.Dock = DockStyle.Fill;
            area.ColumnCount = 2;
            area.RowCount = 1;
            area.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));
            area.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));

            RoundedPanel statusCard = new RoundedPanel();
            statusCard.Dock = DockStyle.Fill;
            statusCard.Margin = new Padding(0, 0, 7, 0);
            statusCard.Radius = 8;
            statusCard.BackColor = Color.White;
            statusCard.Padding = new Padding(18, 14, 18, 18);

            TableLayoutPanel statusLayout = new TableLayoutPanel();
            statusLayout.Dock = DockStyle.Fill;
            statusLayout.ColumnCount = 2;
            statusLayout.RowCount = 2;
            statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
            statusLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            statusLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            statusCard.Controls.Add(statusLayout);

            Label statusLabel = DesktopUiControls.CreateLabel("상태", 12, FontStyle.Bold, AppColors.Text);
            statusLabel.Dock = DockStyle.Fill;
            statusLabel.Text = "\uC0C1\uD0DC";
            statusLayout.Controls.Add(statusLabel, 0, 0);

            RoundedButton diagnosticButton = DesktopUiControls.CreateButton("진단");
            diagnosticButton.Dock = DockStyle.Fill;
            diagnosticButton.Text = "\uC9C4\uB2E8";
            diagnosticButton.Margin = new Padding(0, 0, 0, 6);
            diagnosticButton.Click += delegate { statusText.Text = controller.DoctorLocal(localFolderText == null ? "" : localFolderText.Text.Trim()); };
            statusLayout.Controls.Add(diagnosticButton, 1, 0);

            statusText = DesktopUiControls.CreateReadOnlyLogTextBox();
            RefreshStatus();
            statusLayout.Controls.Add(statusText, 0, 1);
            statusLayout.SetColumnSpan(statusText, 2);

            RoundedPanel filesCard = new RoundedPanel();
            filesCard.Dock = DockStyle.Fill;
            filesCard.Margin = new Padding(7, 0, 0, 0);
            filesCard.Radius = 8;
            filesCard.BackColor = Color.White;
            filesCard.Padding = new Padding(18, 14, 18, 18);

            TableLayoutPanel filesLayout = new TableLayoutPanel();
            filesLayout.Dock = DockStyle.Fill;
            filesLayout.ColumnCount = 1;
            filesLayout.RowCount = 3;
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            filesLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            filesCard.Controls.Add(filesLayout);

            Label filesLabel = DesktopUiControls.CreateLabel("\uBB38\uC81C \uBC0F \uB3D9\uAE30\uD654 \uD65C\uB3D9", 12, FontStyle.Bold, AppColors.Text);
            filesLabel.Dock = DockStyle.Fill;
            filesLayout.Controls.Add(filesLabel, 0, 0);

            TableLayoutPanel searchRow = new TableLayoutPanel();
            searchRow.Dock = DockStyle.Fill;
            searchRow.ColumnCount = 2;
            searchRow.RowCount = 1;
            searchRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            searchRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            searchRow.Margin = new Padding(0, 0, 0, 6);
            filesLayout.Controls.Add(searchRow, 0, 1);

            Label searchLabel = DesktopUiControls.CreateLabel("파일 검색", 8, FontStyle.Bold, AppColors.Muted);
            searchLabel.Dock = DockStyle.Fill;
            searchLabel.Text = "\uD30C\uC77C \uAC80\uC0C9";
            searchRow.Controls.Add(searchLabel, 0, 0);

            searchText = DesktopUiControls.CreateTextBox();
            searchText.Dock = DockStyle.Fill;
            searchText.Margin = new Padding(0, 0, 0, 4);
            searchText.TextChanged += delegate { QueueSearchRefresh(); };
            searchRow.Controls.Add(searchText, 1, 0);

            fileList = DesktopUiControls.CreateDetailsListView();
            fileList.Columns.Add("대상/결과", 185);
            fileList.Columns.Add("변경", 88);
            fileList.Columns.Add("시간", 105);
            fileList.Columns[0].Text = "\uAC80\uC0C9 \uACB0\uACFC";
            fileList.Columns[1].Text = "\uBCC0\uACBD";
            fileList.Columns[2].Text = "\uC2DC\uAC04";
            fileList.DoubleClick += delegate { OpenSelectedSearchResult(); };
            RefreshRecentFiles();
            filesLayout.Controls.Add(fileList, 0, 2);

            area.Controls.Add(statusCard, 0, 0);
            area.Controls.Add(filesCard, 1, 0);
            return area;
        }

    }
}

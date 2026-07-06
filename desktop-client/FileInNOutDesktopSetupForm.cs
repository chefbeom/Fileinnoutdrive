using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace FileInNOutDesktopSetup
{
    internal sealed class SetupForm : Form
    {
        private readonly string tempRoot;
        private Panel contentPanel;
        private Label[] stepLabels;
        private Button backButton;
        private Button nextButton;
        private Button cancelButton;
        private ComboBox languageCombo;
        private CheckBox desktopShortcutCheck;
        private CheckBox startupTaskCheck;
        private CheckBox startAfterInstallCheck;
        private CheckBox startMenuShortcutsCheck;
        private CheckBox explorerCloudIntegrationCheck;
        private ProgressBar progressBar;
        private Label statusLabel;
        private TextBox logBox;
        private int currentStep;
        private int exitCode = 1;
        private int installResult = 1;
        private bool installing;
        private bool installCompleted;
        private bool createDesktopShortcut;
        private bool installStartupTask;
        private bool startAfterInstall;
        private bool createStartMenuShortcuts;
        private bool enableExplorerCloudIntegration;

        public int ExitCode { get { return exitCode; } }

        public SetupForm(string tempRoot)
        {
            InstallerOptions defaults = InstallerOptions.InteractiveDefaults();
            this.tempRoot = tempRoot;
            createDesktopShortcut = defaults.CreateDesktopShortcut;
            installStartupTask = defaults.InstallStartupTask;
            startAfterInstall = defaults.StartAfterInstall;
            createStartMenuShortcuts = defaults.CreateStartMenuShortcuts;
            enableExplorerCloudIntegration = true;

            Text = "FileInNOut Desktop Setup";
            Width = 724;
            Height = 486;
            MinimumSize = new Size(724, 486);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            BuildLayout();
            ShowStep(0);
        }

        private void BuildLayout()
        {
            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.ColumnCount = 2;
            root.RowCount = 2;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
            root.BackColor = SystemColors.Control;

            Panel brandPanel = BuildBrandPanel();
            root.Controls.Add(brandPanel, 0, 0);
            root.SetRowSpan(brandPanel, 2);

            contentPanel = new Panel();
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.BackColor = SystemColors.Window;
            root.Controls.Add(contentPanel, 1, 0);

            Panel footer = new Panel();
            footer.Dock = DockStyle.Fill;
            footer.BackColor = SystemColors.Control;
            footer.Padding = new Padding(0, 10, 12, 10);

            FlowLayoutPanel buttons = new FlowLayoutPanel();
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.Dock = DockStyle.Right;
            buttons.Width = 300;
            buttons.WrapContents = false;

            cancelButton = new Button();
            cancelButton.Text = "Cancel";
            cancelButton.Width = 86;
            cancelButton.Height = 27;
            cancelButton.Click += delegate { if (!installing) { Close(); } };

            nextButton = new Button();
            nextButton.Text = "Next";
            nextButton.Width = 86;
            nextButton.Height = 27;
            nextButton.Click += delegate { HandleNext(); };

            backButton = new Button();
            backButton.Text = "Back";
            backButton.Width = 86;
            backButton.Height = 27;
            backButton.Click += delegate { HandleBack(); };

            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(nextButton);
            buttons.Controls.Add(backButton);
            footer.Controls.Add(buttons);
            root.Controls.Add(footer, 1, 1);

            Controls.Add(root);
        }

        private Panel BuildBrandPanel()
        {
            Panel panel = new Panel();
            panel.Dock = DockStyle.Fill;
            panel.BackColor = Color.White;

            Panel mark = new Panel();
            mark.Left = 49;
            mark.Top = 38;
            mark.Width = 82;
            mark.Height = 82;
            mark.Paint += delegate(object sender, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                using (SolidBrush shadow = new SolidBrush(Color.FromArgb(226, 235, 231)))
                {
                    e.Graphics.FillRectangle(shadow, 16, 49, 52, 11);
                }
                using (SolidBrush accent = new SolidBrush(Color.FromArgb(34, 131, 100)))
                using (SolidBrush green = new SolidBrush(Color.FromArgb(62, 169, 122)))
                using (SolidBrush dark = new SolidBrush(Color.FromArgb(27, 91, 72)))
                {
                    e.Graphics.FillRectangle(green, 16, 29, 22, 30);
                    e.Graphics.FillRectangle(accent, 34, 20, 22, 39);
                    e.Graphics.FillRectangle(dark, 52, 36, 14, 23);
                    e.Graphics.FillEllipse(accent, 22, 62, 38, 8);
                }
            };
            panel.Controls.Add(mark);

            Label name = new Label();
            name.Text = "FileInNOut";
            name.AutoSize = false;
            name.Left = 20;
            name.Top = 132;
            name.Width = 140;
            name.Height = 24;
            name.TextAlign = ContentAlignment.MiddleCenter;
            name.Font = new Font(Font.FontFamily, 11, FontStyle.Bold);
            name.ForeColor = Color.FromArgb(31, 84, 68);
            panel.Controls.Add(name);

            Label subtitle = new Label();
            subtitle.Text = "Desktop Setup";
            subtitle.AutoSize = false;
            subtitle.Left = 20;
            subtitle.Top = 156;
            subtitle.Width = 140;
            subtitle.Height = 22;
            subtitle.TextAlign = ContentAlignment.MiddleCenter;
            subtitle.ForeColor = Color.FromArgb(92, 92, 92);
            panel.Controls.Add(subtitle);

            stepLabels = new Label[3];
            stepLabels[0] = CreateStepLabel("1  Welcome", 228);
            stepLabels[1] = CreateStepLabel("2  Options", 262);
            stepLabels[2] = CreateStepLabel("3  Install", 296);
            panel.Controls.Add(stepLabels[0]);
            panel.Controls.Add(stepLabels[1]);
            panel.Controls.Add(stepLabels[2]);
            return panel;
        }

        private Label CreateStepLabel(string text, int top)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = false;
            label.Left = 22;
            label.Top = top;
            label.Width = 136;
            label.Height = 28;
            label.TextAlign = ContentAlignment.MiddleLeft;
            label.ForeColor = Color.FromArgb(96, 96, 96);
            return label;
        }

        private void ShowStep(int step)
        {
            CaptureOptions();
            currentStep = step;
            contentPanel.Controls.Clear();
            contentPanel.BackColor = SystemColors.Window;

            if (step == 0)
            {
                BuildWelcomeStep();
            }
            else if (step == 1)
            {
                BuildOptionsStep();
            }
            else
            {
                BuildInstallStep();
            }

            UpdateStepLabels();
            UpdateButtons();
        }

        private void BuildWelcomeStep()
        {
            AddHeader("FileInNOut Desktop Setup Wizard", "Install FileInNOut Desktop and connect it with Windows shortcuts, startup, and file sync features.");

            Label languageLabel = new Label();
            languageLabel.Text = "Setup language";
            languageLabel.Left = 34;
            languageLabel.Top = 122;
            languageLabel.Width = 180;
            languageLabel.Height = 22;
            contentPanel.Controls.Add(languageLabel);

            languageCombo = new ComboBox();
            languageCombo.DropDownStyle = ComboBoxStyle.DropDownList;
            languageCombo.Left = 34;
            languageCombo.Top = 148;
            languageCombo.Width = 230;
            languageCombo.Items.AddRange(new object[] { "Korean", "English" });
            languageCombo.SelectedIndex = 0;
            contentPanel.Controls.Add(languageCombo);

            Label hint = new Label();
            hint.Text = "Click Next to choose installation options.";
            hint.Left = 34;
            hint.Top = 232;
            hint.Width = PageWidth();
            hint.Height = 28;
            hint.ForeColor = Color.FromArgb(76, 76, 76);
            hint.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(hint);
        }

        private void BuildOptionsStep()
        {
            AddHeader("Choose installation options", "Select how FileInNOut Desktop should be added to this Windows account.");

            int top = 112;
            desktopShortcutCheck = CreateOptionCheck("Create a desktop shortcut", createDesktopShortcut, top);
            contentPanel.Controls.Add(desktopShortcutCheck);

            top += 34;
            startupTaskCheck = CreateOptionCheck("Start FileInNOut Desktop when Windows starts", installStartupTask, top);
            contentPanel.Controls.Add(startupTaskCheck);

            top += 34;
            startAfterInstallCheck = CreateOptionCheck("Launch FileInNOut Desktop after setup", startAfterInstall, top);
            contentPanel.Controls.Add(startAfterInstallCheck);

            top += 34;
            startMenuShortcutsCheck = CreateOptionCheck("Create Start Menu shortcuts", createStartMenuShortcuts, top);
            contentPanel.Controls.Add(startMenuShortcutsCheck);

            top += 34;
            explorerCloudIntegrationCheck = CreateOptionCheck("Enable Explorer cloud integration (administrator approval)", enableExplorerCloudIntegration, top);
            contentPanel.Controls.Add(explorerCloudIntegrationCheck);

            Label note = new Label();
            note.Text = "FileInNOut Desktop will be registered in Windows Apps and Programs and Features so it can be removed later.";
            note.Left = 34;
            note.Top = top + 52;
            note.Width = PageWidth();
            note.Height = 46;
            note.ForeColor = Color.FromArgb(76, 76, 76);
            note.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(note);
        }

        private void BuildInstallStep()
        {
            string title = installCompleted && installResult == 0 ? "Installation complete" : "Installing FileInNOut Desktop";
            string description = installCompleted && installResult == 0 ? "Setup finished successfully." : "Please wait while setup installs and configures FileInNOut Desktop.";
            if (installCompleted && installResult != 0)
            {
                title = "Installation failed";
                description = "Review the log below, then go back or retry the installation.";
            }
            AddHeader(title, description);

            statusLabel = new Label();
            statusLabel.Text = installCompleted && installResult == 0 ? "Installation complete." : "Preparing installer...";
            statusLabel.Left = 34;
            statusLabel.Top = 112;
            statusLabel.Width = PageWidth();
            statusLabel.Height = 28;
            statusLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(statusLabel);

            progressBar = new ProgressBar();
            progressBar.Left = 34;
            progressBar.Top = 146;
            progressBar.Width = PageWidth();
            progressBar.Height = 24;
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value = installCompleted && installResult == 0 ? 100 : 0;
            progressBar.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(progressBar);

            logBox = new TextBox();
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.Left = 34;
            logBox.Top = 188;
            logBox.Width = PageWidth();
            logBox.Height = 178;
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(logBox);

            if (!installing && !installCompleted)
            {
                StartInstall();
            }
        }

        private CheckBox CreateOptionCheck(string text, bool isChecked, int top)
        {
            CheckBox check = new CheckBox();
            check.Text = text;
            check.Checked = isChecked;
            check.Left = 34;
            check.Top = top;
            check.Width = PageWidth();
            check.Height = 27;
            check.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            return check;
        }

        private void AddHeader(string title, string description)
        {
            Label titleLabel = new Label();
            titleLabel.Text = title;
            titleLabel.Left = 34;
            titleLabel.Top = 28;
            titleLabel.Width = PageWidth();
            titleLabel.Height = 34;
            titleLabel.Font = new Font(Font.FontFamily, 14, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(36, 36, 36);
            titleLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(titleLabel);

            Label descriptionLabel = new Label();
            descriptionLabel.Text = description;
            descriptionLabel.Left = 34;
            descriptionLabel.Top = 66;
            descriptionLabel.Width = PageWidth();
            descriptionLabel.Height = 42;
            descriptionLabel.ForeColor = Color.FromArgb(76, 76, 76);
            descriptionLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            contentPanel.Controls.Add(descriptionLabel);
        }

        private int PageWidth()
        {
            if (contentPanel == null)
            {
                return 420;
            }
            return Math.Max(360, contentPanel.ClientSize.Width - 68);
        }

        private void CaptureOptions()
        {
            if (desktopShortcutCheck != null)
            {
                createDesktopShortcut = desktopShortcutCheck.Checked;
            }
            if (startupTaskCheck != null)
            {
                installStartupTask = startupTaskCheck.Checked;
            }
            if (startAfterInstallCheck != null)
            {
                startAfterInstall = startAfterInstallCheck.Checked;
            }
            if (startMenuShortcutsCheck != null)
            {
                createStartMenuShortcuts = startMenuShortcutsCheck.Checked;
            }
            if (explorerCloudIntegrationCheck != null)
            {
                enableExplorerCloudIntegration = explorerCloudIntegrationCheck.Checked;
            }
        }

        private void HandleBack()
        {
            if (installing)
            {
                return;
            }
            if (currentStep > 0)
            {
                ShowStep(currentStep - 1);
            }
        }

        private void HandleNext()
        {
            if (installing)
            {
                return;
            }

            if (currentStep == 0)
            {
                ShowStep(1);
                return;
            }

            if (currentStep == 1)
            {
                CaptureOptions();
                installCompleted = false;
                installResult = 1;
                ShowStep(2);
                return;
            }

            if (installCompleted && installResult == 0)
            {
                Close();
                return;
            }

            if (installCompleted && installResult != 0)
            {
                installCompleted = false;
                StartInstall();
            }
        }

        private void StartInstall()
        {
            CaptureOptions();

            InstallerOptions options = new InstallerOptions();
            options.CreateDesktopShortcut = createDesktopShortcut;
            options.InstallStartupTask = installStartupTask;
            options.StartAfterInstall = startAfterInstall;
            options.CreateStartMenuShortcuts = createStartMenuShortcuts;
            bool explorerIntegration = enableExplorerCloudIntegration;

            installing = true;
            installCompleted = false;
            installResult = 1;
            exitCode = 1;
            if (progressBar != null)
            {
                progressBar.Value = 10;
            }
            if (statusLabel != null)
            {
                statusLabel.Text = "Preparing installer...";
            }
            if (logBox != null)
            {
                logBox.Clear();
            }
            UpdateButtons();

            ThreadPool.QueueUserWorkItem(delegate
            {
                int result = Program.RunInstaller(
                    tempRoot,
                    new string[0],
                    options,
                    explorerIntegration,
                    delegate(int percent, string message) { UpdateProgress(percent, message); });

                SafeBeginInvoke(delegate
                {
                    installing = false;
                    installCompleted = true;
                    installResult = result;
                    exitCode = result;
                    if (progressBar != null)
                    {
                        progressBar.Value = result == 0 ? 100 : 90;
                    }
                    if (statusLabel != null)
                    {
                        statusLabel.Text = result == 0 ? "Installation complete." : "Installation failed.";
                    }
                    AppendLog(result == 0 ? "Setup registered FileInNOut Desktop for Windows uninstall." : "Setup failed before completion.");
                    UpdateButtons();
                    UpdateStepLabels();
                });
            });
        }

        private void UpdateProgress(int percent, string message)
        {
            SafeBeginInvoke(delegate
            {
                if (progressBar != null)
                {
                    progressBar.Value = Math.Max(progressBar.Minimum, Math.Min(progressBar.Maximum, percent));
                }
                if (!String.IsNullOrWhiteSpace(message))
                {
                    string trimmed = message.Trim();
                    if (statusLabel != null && trimmed.Length < 180)
                    {
                        statusLabel.Text = trimmed;
                    }
                    AppendLog(trimmed);
                }
            });
        }

        private void AppendLog(string message)
        {
            if (logBox != null && !String.IsNullOrWhiteSpace(message))
            {
                logBox.AppendText(message.Trim() + Environment.NewLine);
            }
        }

        private void UpdateButtons()
        {
            if (backButton == null || nextButton == null || cancelButton == null)
            {
                return;
            }

            backButton.Enabled = !installing && currentStep > 0 && !(installCompleted && installResult == 0);
            nextButton.Enabled = !installing;
            cancelButton.Enabled = !installing;
            cancelButton.Text = installCompleted ? "Close" : "Cancel";

            if (currentStep == 0)
            {
                nextButton.Text = "Next";
            }
            else if (currentStep == 1)
            {
                nextButton.Text = "Install";
            }
            else if (installCompleted && installResult == 0)
            {
                nextButton.Text = "Finish";
                cancelButton.Enabled = false;
            }
            else if (installCompleted)
            {
                nextButton.Text = "Retry";
            }
            else
            {
                nextButton.Text = "Install";
                nextButton.Enabled = false;
            }
        }

        private void UpdateStepLabels()
        {
            if (stepLabels == null)
            {
                return;
            }

            for (int i = 0; i < stepLabels.Length; i++)
            {
                if (stepLabels[i] == null)
                {
                    continue;
                }
                bool active = i == currentStep;
                stepLabels[i].ForeColor = active ? Color.FromArgb(31, 110, 84) : Color.FromArgb(96, 96, 96);
                stepLabels[i].Font = new Font(Font.FontFamily, 9, active ? FontStyle.Bold : FontStyle.Regular);
            }
        }

        private void SafeBeginInvoke(MethodInvoker invoker)
        {
            try
            {
                if (!IsDisposed && IsHandleCreated)
                {
                    BeginInvoke(invoker);
                }
            }
            catch
            {
            }
        }
    }
}
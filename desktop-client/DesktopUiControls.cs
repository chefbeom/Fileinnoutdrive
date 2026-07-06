using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace FileInNOutDesktop
{

    internal static class AppColors
    {
        public static readonly Color Background = Color.FromArgb(244, 250, 246);
        public static readonly Color Primary = Color.FromArgb(22, 163, 74);
        public static readonly Color PrimaryDark = Color.FromArgb(21, 128, 61);
        public static readonly Color Sky = Color.FromArgb(52, 211, 153);
        public static readonly Color Text = Color.FromArgb(15, 23, 42);
        public static readonly Color Muted = Color.FromArgb(87, 102, 97);
        public static readonly Color Border = Color.FromArgb(205, 232, 213);
    }

    internal sealed class BufferedPanel : Panel
    {
        public BufferedPanel()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            UpdateStyles();
        }
    }

    internal sealed class RoundedPanel : Panel
    {
        public int Radius = 8;

        public RoundedPanel()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            UpdateStyles();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath path = RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), Radius))
            using (SolidBrush brush = new SolidBrush(BackColor))
            using (Pen pen = new Pen(AppColors.Border))
            {
                e.Graphics.FillPath(brush, path);
                e.Graphics.DrawPath(pen, path);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class RoundedButton : Button
    {
        public bool Primary;
        private bool pressed;

        public RoundedButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            Font = new Font("Malgun Gothic", 9F, FontStyle.Bold);
            ForeColor = AppColors.PrimaryDark;
            BackColor = Color.Transparent;
        }

        protected override void OnMouseDown(MouseEventArgs mevent)
        {
            pressed = true;
            Invalidate();
            base.OnMouseDown(mevent);
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            pressed = false;
            Invalidate();
            base.OnMouseUp(mevent);
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (SolidBrush parentBrush = new SolidBrush(Parent != null ? Parent.BackColor : SystemColors.Control))
            {
                pevent.Graphics.FillRectangle(parentBrush, ClientRectangle);
            }

            Color fill;
            Color border;
            Color text;
            if (Primary)
            {
                fill = pressed ? AppColors.PrimaryDark : AppColors.Primary;
                border = fill;
                text = Color.White;
            }
            else
            {
                fill = pressed ? Color.FromArgb(209, 250, 229) : Color.FromArgb(240, 253, 244);
                border = AppColors.Border;
                text = AppColors.PrimaryDark;
            }

            using (GraphicsPath path = RoundedRect(new Rectangle(0, 0, Width - 1, Height - 1), 8))
            using (SolidBrush brush = new SolidBrush(fill))
            using (Pen pen = new Pen(border))
            using (SolidBrush textBrush = new SolidBrush(text))
            {
                pevent.Graphics.FillPath(brush, path);
                pevent.Graphics.DrawPath(pen, path);
                StringFormat format = new StringFormat();
                format.Alignment = StringAlignment.Center;
                format.LineAlignment = StringAlignment.Center;
                Rectangle textRect = ClientRectangle;
                if (pressed)
                {
                    textRect.Offset(0, 1);
                }
                pevent.Graphics.DrawString(Text, Font, textBrush, textRect, format);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class SmoothProgress : Control
    {
        public int Value;

        public SmoothProgress()
        {
            Height = 18;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath background = RoundedRect(bounds, 8))
            using (SolidBrush backgroundBrush = new SolidBrush(Color.FromArgb(220, 252, 231)))
            {
                e.Graphics.FillPath(backgroundBrush, background);
            }

            int width = Math.Max(4, (int)((Width - 1) * Math.Max(0, Math.Min(100, Value)) / 100d));
            Rectangle fillBounds = new Rectangle(0, 0, width, Height - 1);
            using (GraphicsPath fill = RoundedRect(fillBounds, 8))
            using (LinearGradientBrush brush = new LinearGradientBrush(fillBounds, AppColors.Primary, AppColors.Sky, LinearGradientMode.Horizontal))
            {
                e.Graphics.FillPath(brush, fill);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
    internal static class DesktopUiControls
    {
        public static TextBox CreateTextBox()
        {
            TextBox text = new TextBox();
            text.BorderStyle = BorderStyle.FixedSingle;
            text.Font = new Font("Malgun Gothic", 10F, FontStyle.Regular);
            text.BackColor = Color.White;
            text.ForeColor = AppColors.Text;
            return text;
        }

        public static RoundedButton CreateButton(string text)
        {
            return CreateButton(text, false);
        }

        public static RoundedButton CreateButton(string text, bool primary)
        {
            RoundedButton button = new RoundedButton();
            button.Text = text ?? "";
            button.Primary = primary;
            return button;
        }

        public static CheckBox CreateCheckBox(string text, bool isChecked)
        {
            CheckBox checkBox = new CheckBox();
            checkBox.Text = text ?? "";
            checkBox.Checked = isChecked;
            checkBox.AutoSize = true;
            checkBox.ForeColor = AppColors.Muted;
            return checkBox;
        }

        public static ComboBox CreateDropDown()
        {
            ComboBox comboBox = new ComboBox();
            comboBox.DropDownStyle = ComboBoxStyle.DropDownList;
            return comboBox;
        }

        public static ListView CreateDetailsListView()
        {
            ListView listView = new ListView();
            listView.View = View.Details;
            listView.FullRowSelect = true;
            listView.HideSelection = false;
            listView.BorderStyle = BorderStyle.None;
            listView.Dock = DockStyle.Fill;
            return listView;
        }

        public static TextBox CreateReadOnlyLogTextBox()
        {
            TextBox text = CreateTextBox();
            text.Multiline = true;
            text.ScrollBars = ScrollBars.Vertical;
            text.ReadOnly = true;
            text.BorderStyle = BorderStyle.None;
            text.BackColor = Color.White;
            text.ForeColor = AppColors.Text;
            text.Dock = DockStyle.Fill;
            return text;
        }

        public static Label CreateLabel(string text, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Malgun Gothic", size, style);
            label.ForeColor = color;
            label.AutoSize = false;
            label.TextAlign = ContentAlignment.MiddleLeft;
            return label;
        }
    }
}

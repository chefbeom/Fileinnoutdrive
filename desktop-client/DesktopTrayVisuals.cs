using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

namespace FileInNOutDesktop
{
    internal static class DesktopTrayVisuals
    {
        public static Icon LoadTrayIcon(string installDir)
        {
            string iconPath = Path.Combine(installDir ?? "", "FileInNOutDesktop.ico");
            if (File.Exists(iconPath))
            {
                try
                {
                    return new Icon(iconPath);
                }
                catch
                {
                }
            }
            return CreateGreenFolderIcon();
        }

        public static Icon CreateGreenFolderIcon()
        {
            Bitmap bitmap = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (SolidBrush tab = new SolidBrush(AppColors.PrimaryDark))
                using (SolidBrush body = new SolidBrush(AppColors.Primary))
                using (SolidBrush shine = new SolidBrush(AppColors.Sky))
                using (Pen border = new Pen(Color.FromArgb(21, 128, 61), 1))
                {
                    g.FillRectangle(tab, 5, 7, 11, 6);
                    g.FillRectangle(body, 3, 11, 26, 17);
                    g.DrawRectangle(border, 3, 11, 26, 17);
                    g.FillRectangle(shine, 6, 14, 20, 3);
                }
            }
            IntPtr handle = bitmap.GetHicon();
            return Icon.FromHandle(handle);
        }
    }
}
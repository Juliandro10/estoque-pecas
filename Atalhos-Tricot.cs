using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    const string AppId = "TricotECia.Atalhos";

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int SetCurrentProcessExplicitAppUserModelID(string appID);

    [STAThread]
    static void Main()
    {
        bool created;
        using (var mutex = new Mutex(true, AppId + ".Mutex", out created))
        {
            if (!created)
            {
                Native.ShowExisting();
                return;
            }
            try { SetCurrentProcessExplicitAppUserModelID(AppId); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}

internal static class Native
{
    const int SW_RESTORE = 9;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr FindWindow(string className, string windowName);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static void ShowExisting()
    {
        var hwnd = FindWindow(null, "Tricot & Cia");
        if (hwnd != IntPtr.Zero)
        {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
    }
}

internal sealed class MainForm : Form
{
    const string Web = "https://controle-tricot-e-cia.web.app/";
    const string Tecelagem = "https://controle-tricot-e-cia.web.app/tecelagem/";
    const string Desenv = "https://controle-tricot-e-cia.web.app/desenv-board/";

    readonly Label status;

    public MainForm()
    {
        Text = "Tricot & Cia";
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(400, 560);
        BackColor = Color.FromArgb(14, 18, 24);
        ForeColor = Color.FromArgb(244, 241, 234);
        Font = new Font("Segoe UI", 10f);
        Padding = new Padding(22, 20, 22, 16);

        var title = new Label
        {
            Text = "Tricot & Cia",
            AutoSize = true,
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            Location = new Point(22, 18)
        };
        var sub = new Label
        {
            Text = "Escolha o que abrir",
            AutoSize = true,
            ForeColor = Color.FromArgb(154, 166, 184),
            Location = new Point(22, 52)
        };

        int y = 88;
        Controls.Add(MakeButton(22, y, "Estoque de Peças", "Neste PC, com o programa local",
            Color.FromArgb(61, 186, 122), Color.FromArgb(6, 34, 20), OpenEstoque));
        y += 72;
        Controls.Add(MakeButton(22, y, "Estoque no navegador", "Link da nuvem — qualquer PC ou celular",
            Color.FromArgb(23, 29, 39), ForeColor, () => OpenUrl(Web)));
        y += 72;
        Controls.Add(MakeButton(22, y, "Acompanhar tecelagem", "Quadro das máquinas no navegador",
            Color.FromArgb(23, 29, 39), ForeColor, () => OpenUrl(Tecelagem)));
        y += 72;
        Controls.Add(MakeButton(22, y, "Acompanhar desenvolvimento", "Fila dos setores no navegador",
            Color.FromArgb(23, 29, 39), ForeColor, () => OpenUrl(Desenv)));
        y += 72;
        Controls.Add(MakeButton(22, y, "Tela da TV", "Quadro da tecelagem em tela cheia",
            Color.FromArgb(110, 168, 255), Color.FromArgb(7, 16, 24), OpenTv));
        y += 80;

        var desktop = new Button
        {
            Text = "Colocar este atalho na tela do PC",
            FlatStyle = FlatStyle.Flat,
            BackColor = BackColor,
            ForeColor = Color.FromArgb(154, 166, 184),
            Location = new Point(22, y),
            Size = new Size(356, 32),
            Cursor = Cursors.Hand,
            TextAlign = ContentAlignment.MiddleLeft
        };
        desktop.FlatAppearance.BorderSize = 0;
        desktop.FlatAppearance.MouseOverBackColor = Color.FromArgb(23, 29, 39);
        desktop.Click += delegate { ColocarNaTela(); };

        status = new Label
        {
            AutoSize = false,
            ForeColor = Color.FromArgb(61, 186, 122),
            Location = new Point(22, y + 36),
            Size = new Size(356, 48),
            Text = "Para fixar na barra de tarefas: clique com o botão direito neste ícone na barra → Fixar na barra de tarefas."
        };

        Controls.Add(title);
        Controls.Add(sub);
        Controls.Add(desktop);
        Controls.Add(status);
    }

    Button MakeButton(int x, int y, string title, string hint, Color bg, Color fg, Action onClick)
    {
        var btn = new Button
        {
            Location = new Point(x, y),
            Size = new Size(356, 64),
            FlatStyle = FlatStyle.Flat,
            BackColor = bg,
            ForeColor = fg,
            Text = title + Environment.NewLine + hint,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(10, 0, 10, 0),
            Cursor = Cursors.Hand,
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold)
        };
        btn.FlatAppearance.BorderColor = Color.FromArgb(42, 51, 68);
        btn.Click += delegate { onClick(); };
        return btn;
    }

    static string AppDir()
    {
        return Path.GetDirectoryName(Application.ExecutablePath);
    }

    static void OpenUrl(string url)
    {
        Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
    }

    static void OpenEstoque()
    {
        var dir = AppDir();
        var bg = Path.Combine(dir, "Iniciar-background.vbs");
        if (File.Exists(bg))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "wscript.exe",
                Arguments = "\"" + bg + "\"",
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        for (var i = 0; i < 40; i++)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var ar = client.BeginConnect("127.0.0.1", 3847, null, null);
                    if (ar.AsyncWaitHandle.WaitOne(400) && client.Connected) break;
                }
            }
            catch { }
            Thread.Sleep(200);
        }
        OpenUrl("http://127.0.0.1:3847/");
    }

    static void OpenTv()
    {
        var browsers = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
        };
        foreach (var exe in browsers)
        {
            if (File.Exists(exe))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = exe,
                    Arguments = "--start-fullscreen --app=\"" + Tecelagem + "\"",
                    UseShellExecute = false
                });
                return;
            }
        }
        OpenUrl(Tecelagem);
    }

    void ColocarNaTela()
    {
        var exe = Application.ExecutablePath;
        var wsh = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        dynamic shell = wsh;
        string desktop = shell.SpecialFolders("Desktop");
        dynamic sc = shell.CreateShortcut(Path.Combine(desktop, "Tricot e Cia.lnk"));
        sc.TargetPath = exe;
        sc.WorkingDirectory = AppDir();
        sc.WindowStyle = 1;
        sc.Description = "Atalhos Tricot e Cia";
        sc.Save();
        status.Text = "Pronto. O atalho Tricot e Cia ficou na tela do PC. Clique com o botão direito nele ou neste ícone da barra → Fixar na barra de tarefas.";
    }
}

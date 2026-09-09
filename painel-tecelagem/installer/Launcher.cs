using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace PainelTecelagem
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            bool created;
            using (var mutex = new System.Threading.Mutex(true, @"Local\PainelTecelagem", out created))
            {
                if (!created)
                {
                    MessageBox.Show(
                        "O Painel Tecelagem ja esta aberto.",
                        "Painel Tecelagem",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }

    sealed class MainForm : Form
    {
        readonly string root;
        readonly Label status;
        readonly Label address;
        Process node;

        public MainForm()
        {
            root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            Text = "Painel Tecelagem";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(520, 240);
            BackColor = Color.FromArgb(14, 18, 24);
            ForeColor = Color.FromArgb(244, 241, 234);
            Font = new Font("Segoe UI", 11F);

            var title = new Label
            {
                Text = "Painel da tecelagem ligado",
                AutoSize = false,
                Location = new Point(24, 20),
                Size = new Size(470, 32),
                Font = new Font("Segoe UI", 16F, FontStyle.Bold)
            };

            status = new Label
            {
                Text = "Nao feche esta janela. A TV e os outros PCs usam o endereco abaixo.",
                AutoSize = false,
                Location = new Point(24, 60),
                Size = new Size(470, 48)
            };

            address = new Label
            {
                Text = "Abrindo...",
                AutoSize = false,
                Location = new Point(24, 112),
                Size = new Size(470, 48),
                Font = new Font("Segoe UI", 12F, FontStyle.Bold)
            };

            var open = new Button
            {
                Text = "Abrir na tela",
                Location = new Point(24, 175),
                Size = new Size(150, 36),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(61, 186, 122),
                ForeColor = Color.FromArgb(14, 18, 24)
            };
            open.Click += delegate { OpenBrowser(); };

            var close = new Button
            {
                Text = "Encerrar",
                Location = new Point(190, 175),
                Size = new Size(150, 36),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(42, 51, 68),
                ForeColor = Color.FromArgb(244, 241, 234)
            };
            close.Click += delegate { Close(); };

            Controls.Add(title);
            Controls.Add(status);
            Controls.Add(address);
            Controls.Add(open);
            Controls.Add(close);

            FormClosing += OnClosing;
            Load += OnLoad;
        }

        void OnLoad(object sender, EventArgs e)
        {
            try
            {
                StartServer();
                address.Text = TvAddress();
                OpenBrowser();
            }
            catch (Exception ex)
            {
                status.Text = "Nao foi possivel ligar o painel.";
                address.Text = ex.Message;
            }
        }

        void StartServer()
        {
            var nodeExe = Path.Combine(root, "painel-node.exe");
            var server = Path.Combine(root, "server.cjs");
            if (!File.Exists(nodeExe) || !File.Exists(server))
                throw new Exception("Arquivos do painel nao encontrados. Reinstale o programa.");

            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PainelTecelagem");
            Directory.CreateDirectory(logDir);

            var start = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "server.cjs",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.EnvironmentVariables["PAINEL_ROOT"] = root;
            string pathKey = "PATH";
            foreach (string key in start.EnvironmentVariables.Keys)
            {
                if (string.Equals(key, "PATH", StringComparison.OrdinalIgnoreCase))
                {
                    pathKey = key;
                    break;
                }
            }
            start.EnvironmentVariables[pathKey] = root + ";" + start.EnvironmentVariables[pathKey];

            node = new Process { StartInfo = start, EnableRaisingEvents = true };
            var log = Path.Combine(logDir, "painel.log");
            DataReceivedEventHandler write = delegate(object s, DataReceivedEventArgs a)
            {
                if (string.IsNullOrEmpty(a.Data)) return;
                File.AppendAllText(log, DateTime.Now.ToString("HH:mm:ss") + " " + a.Data + Environment.NewLine, Encoding.UTF8);
            };
            node.OutputDataReceived += write;
            node.ErrorDataReceived += write;
            if (!node.Start()) throw new Exception("Falha ao iniciar o painel.");
            node.BeginOutputReadLine();
            node.BeginErrorReadLine();
        }

        static string TvAddress()
        {
            var lines = new StringBuilder();
            lines.AppendLine("Nesta tela:  http://127.0.0.1:3850");
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var info in nic.GetIPProperties().UnicastAddresses)
                {
                    if (info.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = info.Address.ToString();
                    if (ip.StartsWith("127.")) continue;
                    lines.AppendLine("TV / outros PCs:  http://" + ip + ":3850");
                }
            }
            return lines.ToString();
        }

        static void OpenBrowser()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:3850",
                UseShellExecute = true
            });
        }

        void OnClosing(object sender, FormClosingEventArgs e)
        {
            try
            {
                if (node != null && !node.HasExited) node.Kill();
            }
            catch { }
        }
    }
}

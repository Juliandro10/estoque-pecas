using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace PainelDesenvolvimentos
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            bool created;
            using (var mutex = new System.Threading.Mutex(true, @"Local\PainelDesenvolvimentos", out created))
            {
                if (!created)
                {
                    if (MainForm.HealthOk()) MainForm.OpenBrowser();
                    else
                        MessageBox.Show(
                            "O Desenvolvimentos ja esta no reloginho, mas a tela nao abre.\n\nAbra o Gerenciador de Tarefas, encerre PainelDesenvolvimentos.exe e desenv-node.exe, e abra o programa de novo.",
                            "Desenvolvimentos",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
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
        readonly string logFile;
        readonly NotifyIcon tray;
        Process node;
        bool allowExit;
        bool booted;

        public MainForm()
        {
            root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            logFile = Path.Combine(root, "desenv.log");

            Text = "Desenvolvimentos";
            ShowInTaskbar = false;
            FormBorderStyle = FormBorderStyle.FixedToolWindow;
            ControlBox = false;
            Opacity = 0;
            ShowIcon = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-32000, -32000);
            Size = new Size(1, 1);

            var menu = new ContextMenuStrip();
            menu.Items.Add("Abrir na tela", null, delegate { OpenScreen(); });
            menu.Items.Add("Ver endereco da rede", null, delegate { ShowAddress(); });
            menu.Items.Add("Ver log de erro", null, delegate { OpenLog(); });
            menu.Items.Add("Sair", null, delegate { allowExit = true; Close(); });

            tray = new NotifyIcon
            {
                Text = "Desenvolvimentos — ligando...",
                Icon = SystemIcons.Application,
                Visible = true,
                ContextMenuStrip = menu
            };
            tray.DoubleClick += delegate { OpenScreen(); };

            Log("Launcher 1.0.0 em " + root);
            FormClosing += OnClosing;
            ThreadPool.QueueUserWorkItem(_ => BootFromWorker());
        }

        protected override void SetVisibleCore(bool value)
        {
            if (!IsHandleCreated) CreateHandle();
            base.SetVisibleCore(false);
        }

        void Log(string text)
        {
            var line = DateTime.Now.ToString("HH:mm:ss") + " " + text + Environment.NewLine;
            try { File.AppendAllText(logFile, line, Encoding.UTF8); }
            catch { }
        }

        void BootFromWorker()
        {
            if (booted) return;
            booted = true;
            try
            {
                Log("Iniciando motor");
                StartServer();
                var ok = WaitUntilUp(20000);
                RunOnUi(delegate
                {
                    if (ok)
                    {
                        tray.Text = "Desenvolvimentos — " + FirstLanUrl();
                        Log("No ar " + FirstLanUrl());
                        OpenBrowser();
                    }
                    else
                    {
                        tray.Text = "Desenvolvimentos — com erro";
                        MessageBox.Show(
                            "O programa ligou, mas a tela nao abre na porta 3851.\n\n" + LastLog(),
                            "Desenvolvimentos",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                });
            }
            catch (Exception ex)
            {
                Log("ERRO " + ex.Message);
                RunOnUi(delegate
                {
                    tray.Text = "Desenvolvimentos — com erro";
                    MessageBox.Show(
                        "Nao foi possivel ligar o Desenvolvimentos.\n\n" + ex.Message + "\n\n" + LastLog(),
                        "Desenvolvimentos",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                });
            }
        }

        void RunOnUi(MethodInvoker action)
        {
            try
            {
                if (IsHandleCreated) BeginInvoke(action);
                else action();
            }
            catch
            {
                try { action(); } catch { }
            }
        }

        void StartServer()
        {
            var nodeExe = Path.Combine(root, "desenv-node.exe");
            var server = Path.Combine(root, "server.cjs");
            if (!File.Exists(nodeExe) || !File.Exists(server))
                throw new Exception("Arquivos do programa nao encontrados. Reinstale.");

            var start = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "\"" + server + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.EnvironmentVariables["DESENV_ROOT"] = root;
            start.EnvironmentVariables["DESENV_PORT"] = "3851";
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
            node.OutputDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (!string.IsNullOrEmpty(a.Data)) Log(a.Data);
            };
            node.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (!string.IsNullOrEmpty(a.Data)) Log("ERR " + a.Data);
            };
            node.Exited += delegate
            {
                Log("Motor parou. Codigo " + node.ExitCode);
                try { tray.Text = "Desenvolvimentos — parou"; }
                catch { }
            };
            if (!node.Start()) throw new Exception("Falha ao iniciar o programa.");
            node.BeginOutputReadLine();
            node.BeginErrorReadLine();
            Thread.Sleep(400);
            if (node.HasExited)
                throw new Exception("O motor fechou na hora (codigo " + node.ExitCode + "). Falta o Visual C++ da Microsoft neste Windows.");
        }

        bool WaitUntilUp(int ms)
        {
            var until = DateTime.UtcNow.AddMilliseconds(ms);
            while (DateTime.UtcNow < until)
            {
                if (node != null && node.HasExited) return false;
                if (HealthOk()) return true;
                Thread.Sleep(400);
            }
            return HealthOk();
        }

        public static bool HealthOk()
        {
            string[] urls = { "http://127.0.0.1:3851/api/health", "http://localhost:3851/api/health" };
            foreach (var url in urls)
            {
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create(url);
                    req.Timeout = 1500;
                    req.ReadWriteTimeout = 1500;
                    req.Proxy = null;
                    using (var res = (HttpWebResponse)req.GetResponse())
                    {
                        if ((int)res.StatusCode >= 200 && (int)res.StatusCode < 300)
                            return true;
                    }
                }
                catch { }
            }
            return false;
        }

        string LastLog()
        {
            try
            {
                if (!File.Exists(logFile)) return "Sem log em " + logFile;
                var text = File.ReadAllText(logFile, Encoding.UTF8);
                if (text.Length > 1200) text = text.Substring(text.Length - 1200);
                return text;
            }
            catch
            {
                return "Nao deu para ler o log.";
            }
        }

        void OpenLog()
        {
            Log("Abrindo log");
            if (File.Exists(logFile))
                Process.Start(new ProcessStartInfo { FileName = logFile, UseShellExecute = true });
            else
                MessageBox.Show("Ainda nao existe log em\n" + logFile, "Desenvolvimentos");
        }

        static bool IsLanIp(string ip)
        {
            if (ip.StartsWith("127.")) return false;
            if (ip.StartsWith("100.")) return false;
            return true;
        }

        static string FirstLanUrl()
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var info in nic.GetIPProperties().UnicastAddresses)
                {
                    if (info.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = info.Address.ToString();
                    if (!IsLanIp(ip)) continue;
                    return "http://" + ip + ":3851";
                }
            }
            return "http://127.0.0.1:3851";
        }

        static string NetworkAddress()
        {
            var lines = new StringBuilder();
            lines.AppendLine("Neste PC:  http://127.0.0.1:3851");
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var info in nic.GetIPProperties().UnicastAddresses)
                {
                    if (info.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = info.Address.ToString();
                    if (!IsLanIp(ip)) continue;
                    lines.AppendLine("Outro PC:  http://" + ip + ":3851");
                }
            }
            lines.AppendLine();
            lines.AppendLine("Entre com a mesma conta do Estoque de Pecas.");
            return lines.ToString();
        }

        public static void OpenBrowser()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:3851",
                UseShellExecute = true
            });
        }

        void OpenScreen()
        {
            if (HealthOk())
            {
                OpenBrowser();
                return;
            }
            MessageBox.Show(
                "A tela nao esta no ar.\n\n" + LastLog(),
                "Desenvolvimentos",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        void ShowAddress()
        {
            MessageBox.Show(
                NetworkAddress(),
                "Desenvolvimentos",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (!allowExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                return;
            }
            try
            {
                if (tray != null) tray.Visible = false;
                if (node != null && !node.HasExited) node.Kill();
            }
            catch { }
        }
    }
}

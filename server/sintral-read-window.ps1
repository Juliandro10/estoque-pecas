$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class SintralWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, StringBuilder lParam);
  public const int WM_GETTEXT = 0x000D;
  public const int WM_GETTEXTLENGTH = 0x000E;
  public static List<string> lines = new List<string>();
  public static string title = "";
  public static int pid = 0;
  static string ReadControlText(IntPtr hWnd, string cls) {
    var lower = cls.ToLowerInvariant();
    if (lower.Contains("edit") || lower.Contains("richedit") || lower.Contains("static")) {
      int len = (int)SendMessage(hWnd, WM_GETTEXTLENGTH, IntPtr.Zero, null);
      if (len <= 0) return "";
      var sb = new StringBuilder(Math.Min(len + 16, 512 * 1024));
      SendMessage(hWnd, WM_GETTEXT, (IntPtr)sb.Capacity, sb);
      return sb.ToString();
    }
    int cap = Math.Max(GetWindowTextLength(hWnd), 0) + 1;
    var win = new StringBuilder(Math.Min(cap, 8192));
    GetWindowText(hWnd, win, win.Capacity);
    return win.ToString();
  }
  static void PushText(string cls, string txt) {
    if (string.IsNullOrWhiteSpace(txt)) return;
    var parts = txt.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
    foreach (var part in parts) {
      var line = part.TrimEnd();
      if (string.IsNullOrWhiteSpace(line)) continue;
      lines.Add(cls + " :: " + line);
    }
  }
  static bool AddHwnd(IntPtr hWnd, IntPtr lParam) {
    var cls = new StringBuilder(256); GetClassName(hWnd, cls, cls.Capacity);
    var clsName = cls.ToString();
    var txt = ReadControlText(hWnd, clsName);
    PushText(clsName, txt);
    EnumChildWindows(hWnd, AddHwnd, IntPtr.Zero);
    return true;
  }
  public static void ReadPid(int targetPid) {
    lines = new List<string>();
    title = "";
    pid = targetPid;
    EnumWindows((hWnd, lParam) => {
      uint p; GetWindowThreadProcessId(hWnd, out p);
      if ((int)p != targetPid) return true;
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, sb.Capacity);
      if (string.IsNullOrEmpty(title) && sb.Length > 0) title = sb.ToString();
      AddHwnd(hWnd, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
  }
}
"@

function Find-SintralProcess {
  $candidates = Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowTitle -match 'Controle Sintral|Sintral Check|Sintral' -or
      $_.ProcessName -match '^(sintralcheckexe|SintralCheck|SintralCheckExe|m1)$'
    } |
    Sort-Object {
      if ($_.MainWindowTitle -match 'Controle Sintral') { 0 }
      elseif ($_.MainWindowTitle -match 'Sintral') { 1 }
      else { 2 }
    }, Id

  foreach ($proc in $candidates) {
    if ($proc.MainWindowTitle -match 'Controle Sintral|Sintral') { return $proc }
  }
  return $candidates | Select-Object -First 1
}

$proc = Find-SintralProcess
if (-not $proc) {
  @{ running = $false; lines = @(); title = '' } | ConvertTo-Json -Compress
  exit 0
}

[SintralWin]::ReadPid($proc.Id)
$title = [SintralWin]::title
if (-not $title) { $title = $proc.MainWindowTitle }
@{
  running = $true
  pid = $proc.Id
  process = $proc.ProcessName
  title = $title
  lines = [SintralWin]::lines
} | ConvertTo-Json -Compress -Depth 4

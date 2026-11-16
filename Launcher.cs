using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace RPGSoundscapeLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                // Priority 1: Unpacked native Electron executable
                string unpackedExe = Path.Combine(baseDir, "release", "win-unpacked", "RPGSoundscape.exe");
                if (File.Exists(unpackedExe))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(unpackedExe);
                    psi.WorkingDirectory = Path.GetDirectoryName(unpackedExe);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                    return;
                }

                // Priority 2: Standalone portable single-file executable
                // (electron-builder names it RPGSoundscape-Portable-<version>.exe)
                string portableDir = Path.Combine(baseDir, "release");
                string[] portableExes = Directory.Exists(portableDir)
                    ? Directory.GetFiles(portableDir, "RPGSoundscape-Portable-*.exe")
                    : new string[0];
                if (portableExes.Length > 0)
                {
                    Array.Sort(portableExes);
                    string portableExe = portableExes[0];
                    ProcessStartInfo psi = new ProcessStartInfo(portableExe);
                    psi.WorkingDirectory = Path.GetDirectoryName(portableExe);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                    return;
                }

                // Priority 3: Fallback via Electron CLI
                string electronMain = Path.Combine(baseDir, "electron", "main.cjs");
                if (File.Exists(electronMain))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c npx electron electron\\main.cjs");
                    psi.WorkingDirectory = baseDir;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    psi.CreateNoWindow = true;
                    Process.Start(psi);
                    return;
                }

                MessageBox.Show(
                    "Файл RPGSoundscape.exe не найден ни в release\\win-unpacked, ни portable-сборка в папке release! Пожалуйста, проверьте файлы программы.",
                    "RPG Soundscape Studio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Не удалось запустить RPG Soundscape Studio:\n\n" + ex.Message,
                    "Ошибка запуска",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}

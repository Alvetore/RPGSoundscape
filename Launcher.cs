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
                string portableExe = Path.Combine(baseDir, "release", "RPGSoundscape 1.0.0.exe");
                if (File.Exists(portableExe))
                {
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
                    "Файл RPGSoundscape.exe не найден в папке release\\win-unpacked! Пожалуйста, проверьте файлы программы.",
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

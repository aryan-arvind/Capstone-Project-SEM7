import os
import subprocess

image_path = os.path.abspath(os.path.join("data", "1391982_20190304094004_img_20190304_093425.jpg"))

csharp_code = """
using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;

public class WinOCR
{
    public static async Task<string> RecognizeTextAsync(string imagePath)
    {
        StorageFile file = await StorageFile.GetFileFromPathAsync(imagePath);
        using (var stream = await file.OpenAsync(FileAccessMode.Read))
        {
            BitmapDecoder decoder = await BitmapDecoder.CreateAsync(stream);
            SoftwareBitmap softwareBitmap = await decoder.GetSoftwareBitmapAsync();
            OcrEngine engine = OcrEngine.TryCreateFromUserProfileLanguage() ?? OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language("en-US"));
            if (engine == null) return "ENGINE_NULL";
            OcrResult result = await engine.RecognizeAsync(softwareBitmap);
            return result.Text;
        }
    }
}
"""

ps_script = f"""
$code = @"
{csharp_code}
"@

try {{
    Add-Type -TypeDefinition $code -Language CSharp
    $task = [WinOCR]::RecognizeTextAsync('{image_path.replace("\\", "\\\\")}')
    $task.Wait()
    Write-Output "OCR_SUCCESS:"
    Write-Output $task.Result
}} catch {{
    Write-Output "OCR_ERROR: $($_.Exception.Message)"
}}
"""

res = subprocess.run(["powershell", "-Command", ps_script], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)

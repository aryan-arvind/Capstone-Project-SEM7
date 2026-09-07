import os
import sys
import subprocess
from PIL import Image

image_path = os.path.abspath(os.path.join("data", "1391982_20190304094004_img_20190304_093425.jpg"))
print("Testing image:", image_path)

if os.path.exists(image_path):
    img = Image.open(image_path)
    print("Format:", img.format, "Size:", img.size, "Mode:", img.mode)

# Test powershell WinRT OCR
ps_cmd = f"""
$path = '{image_path}'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }}[0]

function Await-Task($WinRtTask) {{
    $type = $WinRtTask.GetType().GetInterfaces() | Where-Object {{ $_.Name -eq 'IAsyncOperation`1' }}
    if ($null -eq $type) {{ return $null }}
    $targetType = $type.GetGenericArguments()[0]
    $m = $asTaskGeneric.MakeGenericMethod($targetType)
    $netTask = $m.Invoke($null, @($WinRtTask))
    $netTask.Wait()
    return $netTask.Result
}}

try {{
    $file = Await-Task ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path))
    $stream = Await-Task ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
    $decoder = Await-Task ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
    $softwareBitmap = Await-Task ($decoder.GetSoftwareBitmapAsync())
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguage()
    if ($null -eq $engine) {{
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
    }}
    $ocrResult = Await-Task ($engine.RecognizeAsync($softwareBitmap))
    Write-Output "WIN_OCR_SUCCESS:"
    Write-Output $ocrResult.Text
}} catch {{
    Write-Output "WIN_OCR_ERROR: $($_.Exception.Message)"
}}
"""

res = subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, text=True)
print("PowerShell STDOUT:", res.stdout)
print("PowerShell STDERR:", res.stderr)

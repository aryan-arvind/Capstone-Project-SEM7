param (
    [string]$ImagePath
)

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }[0]

    function Await-Task($WinRtTask) {
        $type = $WinRtTask.GetType().GetInterfaces() | Where-Object { $_.Name -eq 'IAsyncOperation`1' }
        if ($null -eq $type) { return $null }
        $targetType = $type.GetGenericArguments()[0]
        $m = $asTaskGeneric.MakeGenericMethod($targetType)
        $netTask = $m.Invoke($null, @($WinRtTask))
        $netTask.Wait()
        return $netTask.Result
    }

    $file = Await-Task ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Get-Item $ImagePath).FullName))
    $stream = Await-Task ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
    $decoder = Await-Task ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
    $softwareBitmap = Await-Task ($decoder.GetSoftwareBitmapAsync())

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguage()
    if ($null -eq $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
    }

    $ocrResult = Await-Task ($engine.RecognizeAsync($softwareBitmap))
    Write-Output $ocrResult.Text
} catch {
    Write-Output "OCR_FAILED"
}

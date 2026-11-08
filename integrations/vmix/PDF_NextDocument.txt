Try
    Dim xml As New System.Xml.XmlDocument()
    xml.LoadXml(API.XML())
    Dim inputs As System.Xml.XmlNodeList = xml.SelectNodes("/vmix/inputs/input[@type='Browser' and (starts-with(@title, 'vMix PDF Viewer @') or starts-with(@title, 'PDF Viewer @'))]")
    If inputs.Count <> 1 Then Throw New System.Exception("Подключите один источник через Настройки vMix PDF Viewer")
    Dim title As String = inputs(0).Attributes("title").Value
    Dim viewerPort As Integer = Integer.Parse(title.Substring(title.LastIndexOf("@") + 1))
    If viewerPort < 1024 OrElse viewerPort > 65535 Then Throw New System.Exception("Некорректный порт vMix PDF Viewer")
    Dim request = System.Net.WebRequest.Create("http://127.0.0.1:" & viewerPort.ToString() & "/api/library/navigate?action=next")
    request.Method = "POST"
    request.ContentLength = 0
    request.Timeout = 1500
    request.Proxy = Nothing
    Using response = request.GetResponse()
    End Using
Catch ex As System.Exception
    Console.WriteLine("vMix PDF Viewer: " & ex.Message)
End Try
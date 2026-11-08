import { randomUUID } from 'node:crypto';

export const commands = [
  { id: 'PDF_Next', title: 'Следующая страница', route: '/api/page?action=next', key: 'PageDown' },
  { id: 'PDF_Previous', title: 'Предыдущая страница', route: '/api/page?action=previous', key: 'PageUp' },
  { id: 'PDF_NextDocument', title: 'Следующий PDF', route: '/api/library/navigate?action=next' },
  { id: 'PDF_PreviousDocument', title: 'Предыдущий PDF', route: '/api/library/navigate?action=previous' },
  { id: 'PDF_First', title: 'Первая страница', route: '/api/page?action=first' },
  { id: 'PDF_Last', title: 'Последняя страница', route: '/api/page?action=last' }
];

export function commandCode(command, portFile = null) {
  if (!commands.includes(command)) throw new Error('Неизвестная команда PDF');
  return `Try
    Dim xml As New System.Xml.XmlDocument()
    xml.LoadXml(API.XML())
    Dim inputs As System.Xml.XmlNodeList = xml.SelectNodes("/vmix/inputs/input[@type='Browser' and (starts-with(@title, 'vMix PDF Viewer @') or starts-with(@title, 'PDF Viewer @'))]")
    If inputs.Count <> 1 Then Throw New System.Exception("Подключите один источник через Настройки vMix PDF Viewer")
    Dim title As String = inputs(0).Attributes("title").Value
    Dim viewerPort As Integer = Integer.Parse(title.Substring(title.LastIndexOf("@") + 1))
    If viewerPort < 1024 OrElse viewerPort > 65535 Then Throw New System.Exception("Некорректный порт vMix PDF Viewer")
    Dim request = System.Net.WebRequest.Create("http://127.0.0.1:" & viewerPort.ToString() & "${command.route}")
    request.Method = "POST"
    request.ContentLength = 0
    request.Timeout = 1500
    request.Proxy = Nothing
    Using response = request.GetResponse()
    End Using
Catch ex As System.Exception
    Console.WriteLine("vMix PDF Viewer: " & ex.Message)
End Try`.replaceAll("\n", "\r\n");
}
const escapeXml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function shortcutTemplate() {
  return `<?xml version="1.0" encoding="utf-8"?>
<ShortcutsTemplate><Name>vMix PDF Viewer — страницы</Name><Shortcuts>${commands.filter(command => command.key).map(command => `
<Shortcut><ID>${randomUUID()}</ID><GetInputByNumber>false</GetInputByNumber><Disabled>false</Disabled><Triggers />
<Title>${escapeXml(command.title)}</Title><Value>${escapeXml(command.id)}</Value><Description1 /><Description2 /><SelectedIndex>-1</SelectedIndex>
<ExpandedKey>${command.key}</ExpandedKey><Key>None</Key><Function>ScriptStart</Function><Duration>1000</Duration>
<Input><Key>00000000-0000-0000-0000-000000000000</Key><Number>0</Number></Input><MIDIChannel>0</MIDIChannel><MIDINote>0</MIDINote></Shortcut>`).join('')}
</Shortcuts></ShortcutsTemplate>`;
}

Option Explicit

Private Const SH_CONFIG As String = "Config"
Private Const SH_COTIZADOR As String = "Cotizador"
Private Const SH_HISTORIAL As String = "Historial"
Private Const SH_IMPRESION As String = "Impresion_A4"
Private Const SH_BD As String = "BD_Productos"

' =============================
' UTILIDADES
' =============================

Private Function UltimaFila(ByVal ws As Worksheet, ByVal col As String) As Long
    UltimaFila = ws.Cells(ws.Rows.Count, col).End(xlUp).Row
End Function

Private Function SiguienteNumeroInterno() As Long
    Dim wsCfg As Worksheet
    Set wsCfg = ThisWorkbook.Worksheets(SH_CONFIG)

    If Trim(CStr(wsCfg.Range("B5").Value)) = "" Then
        wsCfg.Range("B5").Value = 0
    End If

    SiguienteNumeroInterno = CLng(wsCfg.Range("B5").Value) + 1
End Function

Private Function FormatearNumeroCotizacion(ByVal numeroInterno As Long) As String
    Dim wsCfg As Worksheet
    Dim prefijo As String
    Dim puntoVta As String

    Set wsCfg = ThisWorkbook.Worksheets(SH_CONFIG)
    prefijo = Trim(CStr(wsCfg.Range("B3").Value))
    puntoVta = Trim(CStr(wsCfg.Range("B4").Value))

    If prefijo = "" Then prefijo = "COT"
    If puntoVta = "" Then puntoVta = "0001"

    FormatearNumeroCotizacion = prefijo & "-" & ponto(puntoVta) & "-" & Format(numeroInterno, "00000000")
End Function

Private Function ponto(ByVal s As String) As String
    ' Asegura 4 dígitos en punto de venta
    ponto = Right$("0000" & s, 4)
End Function

Private Function ContarItemsCotizador() As Long
    Dim ws As Worksheet, r As Long, cnt As Long
    Set ws = ThisWorkbook.Worksheets(SH_COTIZADOR)

    cnt = 0
    For r = 8 To 31
        If Trim(CStr(ws.Cells(r, "B").Value)) <> "" Then cnt = cnt + 1
    Next r
    ContarItemsCotizador = cnt
End Function

' =============================
' ACCIONES PRINCIPALES
' =============================

Public Sub NuevoCotizador()
    Dim ws As Worksheet
    Dim r As Long

    Set ws = ThisWorkbook.Worksheets(SH_COTIZADOR)

    ws.Range("B2").Value = ""
    ws.Range("E2").Value = Date

    For r = 8 To 31
        ws.Cells(r, "A").Value = ""
        ws.Cells(r, "B").Value = ""
        ws.Cells(r, "C").Value = ""
        ws.Cells(r, "D").Value = ""
        ws.Cells(r, "E").Value = ""
        ws.Cells(r, "F").Value = ""
        ws.Cells(r, "G").Value = 0
        ws.Cells(r, "H").Value = 21
        ws.Cells(r, "I").Formula = "=IF(E" & r & "=""",0,E" & r & "*F" & r & "*(1-G" & r & "/100))"
    Next r

    Dim n As Long
    n = SiguienteNumeroInterno()
    ws.Range("H2").Value = FormatearNumeroCotizacion(n)

    Call RenumerarItems
    MsgBox "Cotizador listo: " & ws.Range("H2").Value, vbInformation
End Sub

Public Sub LimpiarCotizador()
    If MsgBox("¿Limpiar el cotizador actual?", vbQuestion + vbYesNo) = vbYes Then
        NuevoCotizador
    End If
End Sub

Public Sub AgregarLinea()
    Dim ws As Worksheet
    Dim r As Long

    Set ws = ThisWorkbook.Worksheets(SH_COTIZADOR)

    For r = 8 To 31
        If Trim(CStr(ws.Cells(r, "B").Value)) = "" Then
            ws.Cells(r, "A").Value = r - 7
            ws.Cells(r, "E").Value = 1
            ws.Cells(r, "G").Value = 0
            ws.Cells(r, "H").Value = 21
            ws.Cells(r, "I").Formula = "=IF(E" & r & "=""",0,E" & r & "*F" & r & "*(1-G" & r & "/100))"
            ws.Cells(r, "B").Select
            Exit Sub
        End If
    Next r

    MsgBox "No hay más espacio de líneas (límite 24).", vbExclamation
End Sub

Public Sub RenumerarItems()
    Dim ws As Worksheet
    Dim r As Long, idx As Long
    Set ws = ThisWorkbook.Worksheets(SH_COTIZADOR)

    idx = 1
    For r = 8 To 31
        If Trim(CStr(ws.Cells(r, "B").Value)) <> "" Then
            ws.Cells(r, "A").Value = idx
            idx = idx + 1
        Else
            ws.Cells(r, "A").Value = ""
        End If
    Next r
End Sub

Public Sub GuardarEnHistorial()
    Dim wsC As Worksheet, wsH As Worksheet, wsCfg As Worksheet
    Dim fila As Long
    Dim cantItems As Long
    Dim subtotal As Double, iva As Double, total As Double
    Dim numero As String

    Set wsC = ThisWorkbook.Worksheets(SH_COTIZADOR)
    Set wsH = ThisWorkbook.Worksheets(SH_HISTORIAL)
    Set wsCfg = ThisWorkbook.Worksheets(SH_CONFIG)

    If Trim(CStr(wsC.Range("B2").Value)) = "" Then
        MsgBox "Ingresá un cliente antes de guardar.", vbExclamation
        Exit Sub
    End If

    cantItems = ContarItemsCotizador()
    If cantItems = 0 Then
        MsgBox "No hay productos cargados.", vbExclamation
        Exit Sub
    End If

    numero = Trim(CStr(wsC.Range("H2").Value))
    If numero = "" Then
        MsgBox "No hay número de cotización.", vbExclamation
        Exit Sub
    End If

    subtotal = CDbl(Val(wsC.Range("I32").Value))
    iva = CDbl(Val(wsC.Range("I33").Value))
    total = CDbl(Val(wsC.Range("I34").Value))

    fila = UltimaFila(wsH, "A") + 1
    If fila < 2 Then fila = 2

    wsH.Cells(fila, "A").Value = Now
    wsH.Cells(fila, "B").Value = numero
    wsH.Cells(fila, "C").Value = wsC.Range("B2").Value
    wsH.Cells(fila, "D").Value = wsC.Range("E2").Value
    wsH.Cells(fila, "E").Value = cantItems
    wsH.Cells(fila, "F").Value = subtotal
    wsH.Cells(fila, "G").Value = iva
    wsH.Cells(fila, "H").Value = total
    wsH.Cells(fila, "I").Value = Application.UserName

    ' Incrementa numeración (persistencia)
    wsCfg.Range("B5").Value = CLng(wsCfg.Range("B5").Value) + 1

    MsgBox "Cotización guardada en historial: " & numero, vbInformation
End Sub

Public Sub PrepararImpresionA4()
    Dim wsC As Worksheet, wsP As Worksheet
    Dim r As Long

    Set wsC = ThisWorkbook.Worksheets(SH_COTIZADOR)
    Set wsP = ThisWorkbook.Worksheets(SH_IMPRESION)

    wsP.Range("B2").Value = wsC.Range("H2").Value ' nro
    wsP.Range("B3").Value = wsC.Range("E2").Value ' fecha
    wsP.Range("E3").Value = wsC.Range("B2").Value ' cliente

    ' Limpia detalle impresión
    wsP.Range("A8:I31").ClearContents

    For r = 8 To 31
        wsP.Cells(r, "A").Value = wsC.Cells(r, "A").Value
        wsP.Cells(r, "B").Value = wsC.Cells(r, "B").Value
        wsP.Cells(r, "C").Value = wsC.Cells(r, "C").Value
        wsP.Cells(r, "D").Value = wsC.Cells(r, "D").Value
        wsP.Cells(r, "E").Value = wsC.Cells(r, "E").Value
        wsP.Cells(r, "F").Value = wsC.Cells(r, "F").Value
        wsP.Cells(r, "G").Value = wsC.Cells(r, "G").Value
        wsP.Cells(r, "H").Value = wsC.Cells(r, "H").Value
        wsP.Cells(r, "I").Value = wsC.Cells(r, "I").Value
    Next r

    wsP.Range("I32").Value = wsC.Range("I32").Value
    wsP.Range("I33").Value = wsC.Range("I33").Value
    wsP.Range("I34").Value = wsC.Range("I34").Value

    MsgBox "Hoja de impresión preparada.", vbInformation
End Sub

Public Sub ExportarPDF()
    Dim wsP As Worksheet, wsCfg As Worksheet
    Dim carpeta As String, archivo As String, ruta As String
    Dim nro As String

    Set wsP = ThisWorkbook.Worksheets(SH_IMPRESION)
    Set wsCfg = ThisWorkbook.Worksheets(SH_CONFIG)

    carpeta = Trim(CStr(wsCfg.Range("B6").Value))
    If carpeta = "" Then carpeta = ThisWorkbook.Path & Application.PathSeparator

    If Right$(carpeta, 1) <> Application.PathSeparator Then
        carpeta = carpeta & Application.PathSeparator
    End If

    nro = Replace(Trim(CStr(wsP.Range("B2").Value)), "-", "_")
    If nro = "" Then nro = Format(Now, "yyyymmdd_hhnnss")

    archivo = "cotizacion_" & nro & ".pdf"
    ruta = carpeta & archivo

    On Error GoTo ErrHandler
    wsP.ExportAsFixedFormat Type:=xlTypePDF, Filename:=ruta, Quality:=xlQualityStandard, IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=True
    MsgBox "PDF generado: " & ruta, vbInformation
    Exit Sub

ErrHandler:
    MsgBox "No se pudo exportar PDF. Revisá ruta en Config!B6.", vbExclamation
End Sub

' =============================
' AUTOCOMPLETAR PRODUCTO
' =============================

Public Sub CompletarProductoPorCodigo(ByVal fila As Long)
    Dim wsC As Worksheet, wsB As Worksheet
    Dim codigo As String
    Dim r As Long, last As Long

    Set wsC = ThisWorkbook.Worksheets(SH_COTIZADOR)
    Set wsB = ThisWorkbook.Worksheets(SH_BD)

    codigo = Trim(CStr(wsC.Cells(fila, "B").Value))
    If codigo = "" Then Exit Sub

    last = UltimaFila(wsB, "A")
    For r = 2 To last
        If Trim(CStr(wsB.Cells(r, "A").Value)) = codigo Then
            wsC.Cells(fila, "C").Value = wsB.Cells(r, "B").Value ' descripción
            wsC.Cells(fila, "D").Value = wsB.Cells(r, "C").Value ' unidad
            wsC.Cells(fila, "F").Value = wsB.Cells(r, "D").Value ' precio
            wsC.Cells(fila, "H").Value = wsB.Cells(r, "E").Value ' IVA

            If Trim(CStr(wsC.Cells(fila, "E").Value)) = "" Then wsC.Cells(fila, "E").Value = 1
            If Trim(CStr(wsC.Cells(fila, "G").Value)) = "" Then wsC.Cells(fila, "G").Value = 0

            wsC.Cells(fila, "I").Formula = "=IF(E" & fila & "=""",0,E" & fila & "*F" & fila & "*(1-G" & fila & "/100))"
            Exit Sub
        End If
    Next r

    MsgBox "Código no encontrado en BD_Productos: " & codigo, vbExclamation
End Sub

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

// Importamos librerías de impresión
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

const INVENTARIO_FILE = path.join(__dirname, 'datos', 'inventario.json');
const VENTAS_FILE = path.join(__dirname, 'datos', 'ventas.json');
const COMPROBANTES_DIR = path.join(__dirname, 'comprobantes');

// Asegurar directorios
if (!fs.existsSync(path.join(__dirname, 'datos'))) fs.mkdirSync(path.join(__dirname, 'datos'));
if (!fs.existsSync(COMPROBANTES_DIR)) fs.mkdirSync(COMPROBANTES_DIR);

// --- FUNCIONES ---

function leerDatos(ruta) {
    try {
        if (!fs.existsSync(ruta)) {
            fs.writeFileSync(ruta, '[]');
            return [];
        }
        return JSON.parse(fs.readFileSync(ruta, 'utf8') || '[]');
    } catch (error) { return []; }
}

function guardarDatos(ruta, datos) {
    try {
        fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
        return true;
    } catch (error) { return false; }
}

function generarTicketTxt(venta) {
    // Genera respaldo en TXT
    const fecha = new Date();
    const nombre = `ticket_${venta.id}.txt`;
    const ruta = path.join(COMPROBANTES_DIR, nombre);
    let c = `TICKET #${venta.id}\nFecha: ${fecha.toLocaleString()}\nPago: ${venta.medioPago}\n\n`;
    venta.items.forEach(i => c += `${i.nombre} x${i.cantidad} $${i.subtotal}\n`);
    c += `\nTOTAL: $${venta.total}`;
    try { fs.writeFileSync(ruta, c); } catch (e) { console.error(e); }
}

function imprimirTicketTermico(venta) {
    try {
        const devices = escpos.USB.findPrinter();
        if (!devices || devices.length === 0) return console.log("No hay impresora USB.");

        const device = new escpos.USB();
        const printer = new escpos.Printer(device);

        device.open(function(error){
            if(error) return console.error("Error impresora:", error);
            
            const fecha = new Date(venta.fecha);

            printer
                .font('a').align('ct').style('b')
                .size(1, 1).text('SISTEMA DE VENTAS').size(0, 0)
                .text('--------------------------------')
                .align('lt')
                .text(`Fecha: ${fecha.toLocaleString()}`)
                .text(`Ticket ID: ${venta.id}`)
                .text(`Pago: ${venta.medioPago || 'Efectivo'}`) // Muestra el medio de pago
                .text('--------------------------------')
                .tableCustom([
                    { text:"PROD", align:"LEFT", width:0.50 },
                    { text:"CANT", align:"CENTER", width:0.20 },
                    { text:"$$", align:"RIGHT", width:0.30 }
                ]);

            venta.items.forEach(item => {
                printer.tableCustom([
                    { text: item.nombre.substring(0, 15), align:"LEFT", width:0.50 },
                    { text: item.cantidad.toString(), align:"CENTER", width:0.20 },
                    { text: item.subtotal.toFixed(2), align:"RIGHT", width:0.30 }
                ]);
            });

            printer
                .text('--------------------------------')
                .align('rt')
                .size(1, 1).text(`TOTAL: $${venta.total.toFixed(2)}`).size(0, 0)
                .align('ct')
                .text('Gracias por su compra')
                .cut()
                .close();
        });
    } catch (err) { console.error("Error módulo impresión:", err); }
}

// --- ENDPOINTS ---

app.get('/api/inventario', (req, res) => res.json(leerDatos(INVENTARIO_FILE)));
app.get('/api/ventas', (req, res) => res.json(leerDatos(VENTAS_FILE)));

app.get('/api/ventas-recientes', (req, res) => {
    res.json(leerDatos(VENTAS_FILE).slice(-3).reverse());
});

app.get('/api/caja-diaria', (req, res) => {
    const ventas = leerDatos(VENTAS_FILE);
    const hoy = new Date();
    const delDia = ventas.filter(v => {
        const d = new Date(v.fecha);
        return d.getDate()===hoy.getDate() && d.getMonth()===hoy.getMonth() && d.getFullYear()===hoy.getFullYear();
    });
    res.json({ total: delDia.reduce((a, b) => a + b.total, 0) });
});

app.post('/api/ventas', (req, res) => {
    const nuevaVenta = req.body;
    if (!nuevaVenta || !nuevaVenta.items) return res.status(400).json({ error: 'Datos inválidos' });

    const inventario = leerDatos(INVENTARIO_FILE);
    let errorStock = false;

    // Descontar stock
    nuevaVenta.items.forEach(item => {
        const prod = inventario.find(p => p.id === item.id);
        if (prod && prod.stock >= item.cantidad) prod.stock -= item.cantidad;
        else errorStock = true;
    });

    if (errorStock) return res.status(400).json({ error: 'Stock insuficiente' });

    guardarDatos(INVENTARIO_FILE, inventario);

    // Guardar Venta
    const ventas = leerDatos(VENTAS_FILE);
    nuevaVenta.id = Date.now(); // ID único basado en tiempo
    nuevaVenta.fecha = new Date().toISOString();
    ventas.push(nuevaVenta);
    guardarDatos(VENTAS_FILE, ventas);

    generarTicketTxt(nuevaVenta);
    
    // NOTA: Ya NO imprimimos automáticamente aquí.
    
    res.json({ message: 'Venta OK', venta: nuevaVenta });
});

app.post('/api/productos', (req, res) => {
    const prod = req.body;
    const inv = leerDatos(INVENTARIO_FILE);
    prod.id = (inv.reduce((max, p) => p.id > max ? p.id : max, 0)) + 1;
    inv.push(prod);
    guardarDatos(INVENTARIO_FILE, inv);
    res.json({ message: 'Producto guardado' });
});

// NUEVO ENDPOINT: Imprimir manualmente por ID
app.post('/api/imprimir/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const ventas = leerDatos(VENTAS_FILE);
    const venta = ventas.find(v => v.id === id);

    if (venta) {
        imprimirTicketTermico(venta);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Venta no encontrada' });
    }
});

app.listen(PORT, () => console.log(`Server en http://localhost:${PORT}`));
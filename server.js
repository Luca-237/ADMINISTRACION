const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

// Rutas a los archivos de datos
const INVENTARIO_FILE = path.join(__dirname, 'datos', 'inventario.json');
const VENTAS_FILE = path.join(__dirname, 'datos', 'ventas.json');
const COMPROBANTES_DIR = path.join(__dirname, 'comprobantes');

// Asegurar directorios
if (!fs.existsSync(path.join(__dirname, 'datos'))) {
    fs.mkdirSync(path.join(__dirname, 'datos'));
}
if (!fs.existsSync(COMPROBANTES_DIR)) {
    fs.mkdirSync(COMPROBANTES_DIR);
}

// --- FUNCIONES AUXILIARES ---

function leerDatos(ruta) {
    try {
        if (!fs.existsSync(ruta)) {
            fs.writeFileSync(ruta, '[]');
            return [];
        }
        const data = fs.readFileSync(ruta, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error(`Error leyendo ${ruta}:`, error);
        return [];
    }
}

function guardarDatos(ruta, datos) {
    try {
        fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
        return true;
    } catch (error) {
        console.error(`Error guardando ${ruta}:`, error);
        return false;
    }
}

function generarTicketTxt(venta) {
    const fecha = new Date();
    const nombreArchivo = `ticket_${fecha.getFullYear()}-${(fecha.getMonth()+1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}_${fecha.getHours().toString().padStart(2, '0')}-${fecha.getMinutes().toString().padStart(2, '0')}-${fecha.getSeconds().toString().padStart(2, '0')}.txt`;
    const rutaArchivo = path.join(COMPROBANTES_DIR, nombreArchivo);

    let contenido = `========================================\n`;
    contenido += `          COMPROBANTE DE VENTA          \n`;
    contenido += `========================================\n`;
    contenido += `Fecha: ${fecha.toLocaleDateString()} Hora: ${fecha.toLocaleTimeString()}\n`;
    contenido += `ID Venta: ${Date.now()}\n`; 
    contenido += `----------------------------------------\n`;
    contenido += `PRODUCTOS:\n\n`;

    venta.items.forEach((item, index) => {
        contenido += `${index + 1}. ${item.nombre.toUpperCase()}\n`;
        contenido += `   Cant: ${item.cantidad} x $${item.precio} = $${item.subtotal}\n`;
    });

    contenido += `----------------------------------------\n`;
    contenido += `Subtotal:        $${venta.subtotal.toFixed(2)}\n`;
    contenido += `IVA (${venta.iva_porcentaje}%):      $${(venta.total - venta.subtotal).toFixed(2)}\n`;
    contenido += `========================================\n`;
    contenido += `TOTAL:           $${venta.total.toFixed(2)}\n`;
    contenido += `========================================\n`;

    try {
        fs.writeFileSync(rutaArchivo, contenido);
        console.log(`Ticket generado: ${nombreArchivo}`);
    } catch (err) {
        console.error("Error generando ticket txt:", err);
    }
}

// --- ENDPOINTS ---

app.get('/api/inventario', (req, res) => {
    const productos = leerDatos(INVENTARIO_FILE);
    res.json(productos);
});

app.get('/api/ventas', (req, res) => {
    const ventas = leerDatos(VENTAS_FILE);
    res.json(ventas);
});

// NUEVO: Obtener ultimas 3 ventas para el historial
app.get('/api/ventas-recientes', (req, res) => {
    const ventas = leerDatos(VENTAS_FILE);
    // Tomamos las ultimas 3 y las invertimos para que la más reciente salga primero
    const recientes = ventas.slice(-3).reverse();
    res.json(recientes);
});

app.get('/api/caja-diaria', (req, res) => {
    const ventas = leerDatos(VENTAS_FILE);
    const hoy = new Date();

    const ventasHoy = ventas.filter(v => {
        const fechaVenta = new Date(v.fecha);
        return fechaVenta.getDate() === hoy.getDate() &&
               fechaVenta.getMonth() === hoy.getMonth() &&
               fechaVenta.getFullYear() === hoy.getFullYear();
    });

    const totalCaja = ventasHoy.reduce((acc, v) => acc + (v.total || 0), 0);

    res.json({
        total: totalCaja,
        cantidad: ventasHoy.length
    });
});

app.post('/api/ventas', (req, res) => {
    const nuevaVenta = req.body;

    if (!nuevaVenta || !nuevaVenta.items) {
        return res.status(400).json({ error: 'Datos de venta inválidos' });
    }

    const inventario = leerDatos(INVENTARIO_FILE);
    let stockInsuficiente = false;

    nuevaVenta.items.forEach(itemVenta => {
        const productoEnInventario = inventario.find(p => p.id === itemVenta.id);
        if (productoEnInventario) {
            if (productoEnInventario.stock >= itemVenta.cantidad) {
                productoEnInventario.stock -= itemVenta.cantidad;
            } else {
                stockInsuficiente = true;
            }
        }
    });

    if (stockInsuficiente) {
        return res.status(400).json({ error: 'No hay suficiente stock.' });
    }

    guardarDatos(INVENTARIO_FILE, inventario);

    const ventas = leerDatos(VENTAS_FILE);
    nuevaVenta.fecha = nuevaVenta.fecha || new Date().toISOString();
    ventas.push(nuevaVenta);
    guardarDatos(VENTAS_FILE, ventas);

    generarTicketTxt(nuevaVenta);

    res.json({ message: 'Venta registrada con éxito', venta: nuevaVenta });
});

app.post('/api/productos', (req, res) => {
    const productoNuevo = req.body;
    const inventario = leerDatos(INVENTARIO_FILE);
    
    if (!productoNuevo.id) {
        const maxId = inventario.reduce((max, p) => p.id > max ? p.id : max, 0);
        productoNuevo.id = maxId + 1;
    }
    
    inventario.push(productoNuevo);
    guardarDatos(INVENTARIO_FILE, inventario);
    res.json({ message: 'Producto guardado', producto: productoNuevo });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`- Datos en: ${path.join(__dirname, 'datos')}`);
    console.log(`- Comprobantes en: ${COMPROBANTES_DIR}`);
});
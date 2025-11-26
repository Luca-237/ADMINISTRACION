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
app.use(express.static('public')); // Asume que tu HTML/CSS está en una carpeta 'public'

// Rutas a los archivos de datos
const INVENTARIO_FILE = path.join(__dirname, 'datos', 'inventario.json');
const VENTAS_FILE = path.join(__dirname, 'datos', 'ventas.json');

// --- FUNCIONES AUXILIARES ---

// Función genérica para leer JSON
function leerDatos(ruta) {
    try {
        if (!fs.existsSync(ruta)) {
            // Si no existe, creamos un array vacío
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

// Función genérica para guardar JSON
function guardarDatos(ruta, datos) {
    try {
        fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
        return true;
    } catch (error) {
        console.error(`Error guardando ${ruta}:`, error);
        return false;
    }
}

// --- ENDPOINTS (API) ---

// 1. Obtener Inventario
app.get('/api/inventario', (req, res) => {
    const productos = leerDatos(INVENTARIO_FILE);
    res.json(productos);
});

// 2. Obtener Ventas
app.get('/api/ventas', (req, res) => {
    const ventas = leerDatos(VENTAS_FILE);
    res.json(ventas);
});

// 3. Registrar una Venta (Y actualizar stock)
app.post('/api/ventas', (req, res) => {
    const nuevaVenta = req.body;
    // Estructura esperada en req.body: 
    // { items: [{id, cantidad, ...}], total, subtotal, ... }

    if (!nuevaVenta || !nuevaVenta.items) {
        return res.status(400).json({ error: 'Datos de venta inválidos' });
    }

    const inventario = leerDatos(INVENTARIO_FILE);
    let stockInsuficiente = false;

    // A. Validar y descontar stock
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
        return res.status(400).json({ error: 'No hay suficiente stock para realizar la venta.' });
    }

    // B. Guardar cambios en inventario
    guardarDatos(INVENTARIO_FILE, inventario);

    // C. Guardar la venta
    const ventas = leerDatos(VENTAS_FILE);
    // Agregamos fecha si no viene
    nuevaVenta.fecha = nuevaVenta.fecha || new Date().toISOString();
    ventas.push(nuevaVenta);
    guardarDatos(VENTAS_FILE, ventas);

    res.json({ message: 'Venta registrada con éxito', venta: nuevaVenta });
});

// 4. Agregar/Actualizar Producto (Opcional, para administración)
app.post('/api/productos', (req, res) => {
    const productoNuevo = req.body;
    const inventario = leerDatos(INVENTARIO_FILE);
    
    const index = inventario.findIndex(p => p.id === productoNuevo.id);
    if (index !== -1) {
        // Actualizar existente
        inventario[index] = { ...inventario[index], ...productoNuevo };
    } else {
        // Crear nuevo (asignar ID si no tiene)
        if (!productoNuevo.id) {
            const maxId = inventario.reduce((max, p) => p.id > max ? p.id : max, 0);
            productoNuevo.id = maxId + 1;
        }
        inventario.push(productoNuevo);
    }
    
    guardarDatos(INVENTARIO_FILE, inventario);
    res.json({ message: 'Producto guardado', producto: productoNuevo });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Datos leyendo de: ${path.join(__dirname, 'datos')}`);
});
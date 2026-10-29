const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Статические файлы сайта
app.use(express.static(path.join(__dirname, 'public')));

// Three.js раздаём прямо из node_modules — без внешних CDN
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));

app.listen(PORT, () => {
  console.log(`GardenDesign запущен: http://localhost:${PORT}`);
});

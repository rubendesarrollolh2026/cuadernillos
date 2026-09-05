document.addEventListener('DOMContentLoaded', () => {
    const actionBtn = document.getElementById('action-btn');

    actionBtn.addEventListener('click', () => {
        alert('¡JavaScript funcionando correctamente en el WebView!');
        console.log('Botón presionado');
    });

    console.log('Aplicación Cuadernillos cargada');
});

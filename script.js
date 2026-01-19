const AI_SERVER_URL = "https://hpu2sfarm-backend-m9q4.onrender.com/detect"; 
const FIREBASE_API_KEY = "AIzaSyAQSoG7YJbap3d47qqhEfZWc3kIJr35B5M";

// --- QUẢN LÝ CHUYỂN MÀN HÌNH ---
function switchView(view) {
    document.getElementById('registerScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('btnLogout').classList.add('hidden');

    if (view === 'login') {
        document.getElementById('loginScreen').classList.remove('hidden');
    } 
    else if (view === 'register') {
        document.getElementById('registerScreen').classList.remove('hidden');
    } 
    else if (view === 'dashboard') {
        document.getElementById('dashboardScreen').classList.remove('hidden');
        document.getElementById('btnLogout').classList.remove('hidden');
        
        startClock(); // Bắt đầu đồng hồ
        if (typeof initCamera === 'function') {
            initCamera(); 
        }
        if (typeof startAI_Loop === 'function') {
             startAI_Loop();
        }
    }
}

// --- XỬ LÝ ĐĂNG KÝ ---
function getGPS() {
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('regGPS').value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        }, () => {
            alert("Không thể lấy vị trí. Hãy kiểm tra quyền truy cập trên trình duyệt!");
        });
    } else {
        alert("Trình duyệt không hỗ trợ GPS");
    }
}

function handleRegister() {
    const name = document.getElementById('regName').value;
    const contact = document.getElementById('regContact').value; 
    const pass = document.getElementById('regPass').value;
    const gps = document.getElementById('regGPS').value;

    if (!name || !contact || !pass) {
        alert("Vui lòng điền đầy đủ: Tên, SĐT và Mật khẩu!");
        return;
    }

    // Kiểm tra xem tài khoản đã tồn tại chưa
    if (localStorage.getItem('hpu2s_user_' + contact)) {
        alert("Tài khoản (SĐT/Email) này đã tồn tại! Vui lòng dùng SĐT khác hoặc Đăng nhập.");
        return;
    }

    const user = {
        name: name,
        contact: contact,
        pass: pass,
        gps: gps,
        role: 'user',
        createdAt: new Date().toISOString()
    };

    // Lưu vào LocalStorage giả lập Database
    localStorage.setItem('hpu2s_user_' + contact, JSON.stringify(user));
    
    alert("Đăng ký thành công! Mời bạn đăng nhập.");
    switchView('login');
}

// --- XỬ LÝ ĐĂNG NHẬP ---
function handleLogin() {
    const sdt = document.getElementById('loginContact').value;
    const pass = document.getElementById('loginPass').value;

    if (!sdt || !pass) {
        alert("Vui lòng nhập tài khoản và mật khẩu!");
        return;
    }

    // Lấy dữ liệu user từ LocalStorage
    const storedUser = localStorage.getItem('hpu2s_user_' + sdt);

    if (!storedUser) {
        alert("Tài khoản không tồn tại! Vui lòng kiểm tra lại SĐT hoặc Đăng ký mới.");
        return;
    }

    const userData = JSON.parse(storedUser);

    // Kiểm tra mật khẩu
    if (userData.pass === pass) {
        console.log("Đăng nhập thành công:", userData);
        alert(`Xin chào ${userData.name}! Đang vào vườn...`);
        switchView('dashboard');
    } else {
        alert("Sai mật khẩu! Vui lòng thử lại.");
    }
}

document.getElementById('btnLogout').onclick = () => { 
    stopCamera(); 
    switchView('login'); 
};

// --- CAMERA & AI LOOP ---
let videoStream;
let aiInterval;

async function initCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" },
            audio: false 
        });
        const videoElement = document.getElementById('webcamVideo');
        videoElement.srcObject = videoStream;
        videoElement.classList.remove('hidden');
    } catch(e) { 
        console.error("Lỗi Camera:", e); 
        alert("Không bật được Camera. Hãy cấp quyền hoặc kiểm tra thiết bị!");
    }
}

function stopCamera() {
    if(videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    clearInterval(aiInterval); // Dừng gửi ảnh cho AI
}

function startAI_Loop() {
    // Xóa interval cũ nếu có để tránh trùng lặp
    if (aiInterval) clearInterval(aiInterval);

    aiInterval = setInterval(async () => {
        const video = document.getElementById('webcamVideo');
        
        // Nếu video bị ẩn hoặc chưa có stream thì không làm gì
        if (video.classList.contains('hidden') || !videoStream || video.paused || video.ended) return;

        const canvas = document.getElementById('aiCanvas');
        const context = canvas.getContext('2d');

        // Vẽ hình từ video lên canvas
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Chuyển canvas thành file ảnh và gửi đi
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            
            const formData = new FormData();
            formData.append("file", blob, "plant.jpg");

            try {
                const response = await fetch(AI_SERVER_URL, {
                    method: "POST",
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    updateReport(data);
                } else {
                    console.log("AI Server trả về lỗi:", response.status);
                }
            } catch (err) {
                console.log("Không kết nối được AI Server:", err);
            }
        }, 'image/jpeg', 0.7); // Chất lượng ảnh 0.7 để gửi nhanh hơn

    }, 3000); // Gửi mỗi 3 giây (thay vì 2 giây để đỡ lag)
}

function updateReport(data) {
    const statusEl = document.getElementById('plantStatus');

    document.getElementById('aiDiseaseName').innerText = data.disease || "Không rõ";
    document.getElementById('aiCause').innerText = data.cause || "---";
    document.getElementById('aiSolution').innerText = data.solution || "---";
  
    if (data.status === 'safe') {
        statusEl.className = 'status-display status-safe';
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> AN TOÀN';
    } else {
        statusEl.className = 'status-display status-danger';
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> CẢNH BÁO';
    }
}

function startClock() {
    // Cập nhật giờ ngay lập tức
    const updateTime = () => {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleTimeString('vi-VN');
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Khởi chạy
document.addEventListener("DOMContentLoaded", () => {
    switchView('login');
});
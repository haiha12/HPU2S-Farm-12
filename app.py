# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import base64
import cv2
import numpy as np
from ultralytics import YOLO
import gc  

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
model = None
try:
    model = YOLO('best.pt') 
    print("Đã tải model best.pt...")
except Exception as e:
    model = YOLO('last.pt')
    print(f"⚠️ Lỗi tải best.pt, chuyển sang last.pt: {e}")

DISEASE_INFO = {
    'tea_plant': {
        'status': 'safe',
        'disease': 'Cây khỏe mạnh',
        'cause': 'Môi trường, độ ẩm, ánh sáng đạt chuẩn.',
        'solution': 'Tiếp tục duy trì chế độ chăm sóc hiện tại.'
    },
    'dom_la': {
        'status': 'danger',
        'disease': 'Bệnh đốm lá',
        'cause': 'Bọ xít muỗi',
        'solution': 'Canh tác: Phát quang bụi rậm quanh nương chè, trồng cây che bóng hợp lý, đốn chè đúng kỹ thuật và thu dọn cành lá sau đốn.'
                    'Hóa học: Sử dụng thuốc bảo vệ thực vật thuộc danh mục cho phép của Bộ Nông nghiệp và Môi trường.'
    },
    'cham_xam': {
        'status': 'danger',
        'disease': 'Bệnh chấm xám',
        'cause': 'Nấm Pestalozzia theae',
        'solution': 'Canh tác: Chăm sóc cây sinh trưởng tốt; vệ sinh vườn chè, diệt cỏ dại, ép xanh ngay sau đốn; đốn chè tập trung trong thời gian ngắn.'
                    'Cơ học: Thu gom và tiêu hủy lá bệnh ngay khi bệnh mới xuất hiện.'
                    'Hóa học: Sử dụng thuốc bảo vệ thực vật thuộc danh mục cho phép của Bộ Nông nghiệp và Môi trường.'
    },
    'phong_la': {
        'status': 'danger',
        'disease': 'Bệnh phồng lá',
        'cause': 'Nấm Exobasidium vexans',
        'solution': 'Canh tác: Vệ sinh vườn chè, không đốn tỉa quá sớm; trồng mật độ hợp lý, ưu tiên giống chè Shan; bón phân cân đối; tỉa bỏ và tiêu hủy lá, búp và cành bị bệnh.'
                    'Hóa học: Sử dụng thuốc bảo vệ thực vật thuộc danh mục cho phép của Bộ Nông nghiệp và Môi trường.'
    },
    'chay_la': {
        'status': 'danger',
        'disease': 'Bệnh cháy lá',
        'cause': 'Nấm Rhizoctonia solani, Exobasidium spp',
        'solution': 'Canh tác: Thu dọn lá khô rụng vào đầu xuân hoặc mùa đông để giảm nguồn bệnh; bón phân đầy đủ, làm sạch cỏ, chống hạn nhằm tăng sức sinh trưởng của cây; vùi lá khi đốn (ép xanh) để hạn chế nguồn bệnh.'
                    'Hóa học: Khi bệnh phát sinh, phun thuốc có gốc đồng; thu hái chè sau phun 5-7 ngày.'
    },
    'thoi_bup': {
        'status': 'danger',
        'disease': 'Bệnh thối búp',
        'cause': 'Nấm Colletotrichum theae-sinensis',
        'solution': 'Canh tác: Bón phân cân đối, tăng cường kali; vệ sinh nương chè, thu gom và tiêu hủy tàn dư cây bệnh, lá rụng.'
                    'Hóa học: Sử dụng thuốc bảo vệ thực vật thuộc danh mục cho phép của Bộ Nông nghiệp và Môi trường.'
    },
    'unknown': {
        'status': 'unknown',
        'disease': 'Không nhận diện được',
        'cause': 'Camera chưa nhìn rõ cây hoặc không phải cây chè.',
        'solution': 'Vui lòng đưa camera lại gần lá cây và giữ yên.'
    }
}

@app.route('/')
def home():
    return "<h1>🌿 HPU2 Farm Backend is Running! 🚀</h1>"

@app.route('/detect', methods=['POST'], strict_slashes=False) 
@cross_origin()
def detect():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
        
    img = None
    results = None
    
    try:
        data = request.get_json(force=True, silent=True)
        if not data or 'image' not in data:
            return jsonify({'error': 'Không nhận được dữ liệu ảnh'}), 400
        
        image_data = data['image'] 
        img_bytes = base64.b64decode(data['image'])
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if model is None:
            return jsonify({'error': 'Server chưa có Model'}), 500

        results = model(img)

        detected_classes = []
        max_conf = 0
        
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                conf = float(box.conf[0])
                
                if class_id < len(model.names):
                    class_name = model.names[class_id]
                    detected_classes.append(class_name)
                    if conf > max_conf:
                        max_conf = conf

        print("🔍 AI thấy:", detected_classes) 
        
        response_data = DISEASE_INFO['unknown']
        found_disease = False 

        for name in detected_classes:
            if name in DISEASE_INFO and name != 'tea_plant' and name != 'unknown':
                response_data = DISEASE_INFO[name]
                found_disease = True
                break 

        if not found_disease:
            if 'tea_plant' in detected_classes:
                response_data = DISEASE_INFO['tea_plant']

        response_data = response_data.copy()
        response_data['confidence'] = round(max_conf, 2)
        response_data['disease_name'] = response_data['disease']

        return jsonify(response_data)

    except Exception as e:
        print("❌ Lỗi Server:", str(e))
        return jsonify({'error': str(e)}), 500

    finally:
        try:
            del img
            del results
            del data
            gc.collect() 
        except:
            pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)






# 더 나은 카메라

이 작업을 한동안 미뤄왔습니다. 카메라를 구현하는 것이 WGPU를 올바르게 사용하는 것과 특별히 관련이 있는 것은 아니지만, 계속 신경이 쓰여서 이제는 해야겠습니다.

`lib.rs`가 조금 복잡해지고 있으니, 카메라 코드를 넣을 `camera.rs` 파일을 만듭시다. 가장 먼저 몇 가지 `use` 구문과 `OPENGL_TO_WGPU_MATRIX`를 추가하겠습니다.

```rust
use cgmath::*;
use winit::event::*;
use winit::dpi::PhysicalPosition;
use instant::Duration;
use std::f32::consts::FRAC_PI_2;

#[rustfmt::skip]
pub const OPENGL_TO_WGPU_MATRIX: cgmath::Matrix4<f32> = cgmath::Matrix4::from_cols(
    cgmath::Vector4::new(1.0, 0.0, 0.0, 0.0),
    cgmath::Vector4::new(0.0, 1.0, 0.0, 0.0),
    cgmath::Vector4::new(0.0, 0.0, 0.5, 0.0),
    cgmath::Vector4::new(0.0, 0.0, 0.5, 1.0),
);

const SAFE_FRAC_PI_2: f32 = FRAC_PI_2 - 0.0001;
```

<div class="note">

`std::time::Instant`는 WASM에서 패닉을 일으키므로, [instant 크레이트](https://docs.rs/instant)를 사용하겠습니다. `Cargo.toml`에 이 크레이트를 추가해야 합니다:

```toml
[dependencies]
# ...
instant = "0.1"

[target.'cfg(target_arch = "wasm32")'.dependencies]
instant = { version = "0.1", features = [ "wasm-bindgen" ] }
```

</div>

## 카메라

다음으로, 새로운 `Camera` 구조체를 만들어야 합니다. FPS 스타일 카메라를 사용할 것이므로, 위치(position)와 요(yaw, 수평 회전), 피치(pitch, 수직 회전)를 저장할 것입니다. 뷰 행렬(view matrix)을 생성하기 위한 `calc_matrix` 메서드를 가집니다.

```rust
#[derive(Debug)]
pub struct Camera {
    pub position: Point3<f32>,
    yaw: Rad<f32>,
    pitch: Rad<f32>,
}

impl Camera {
    pub fn new<
        V: Into<Point3<f32>>,
        Y: Into<Rad<f32>>,
        P: Into<Rad<f32>>,
    >(
        position: V,
        yaw: Y,
        pitch: P,
    ) -> Self {
        Self {
            position: position.into(),
            yaw: yaw.into(),
            pitch: pitch.into(),
        }
    }

    pub fn calc_matrix(&self) -> Matrix4<f32> {
        let (sin_pitch, cos_pitch) = self.pitch.0.sin_cos();
        let (sin_yaw, cos_yaw) = self.yaw.0.sin_cos();

        Matrix4::look_to_rh(
            self.position,
            Vector3::new(
                cos_pitch * cos_yaw,
                sin_pitch,
                cos_pitch * sin_yaw
            ).normalize(),
            Vector3::unit_y(),
        )
    }
}
```

## 투영(Projection)

카메라에서 투영(projection)을 분리하기로 했습니다. 투영은 창 크기가 조절될 때만 변경하면 되므로, `Projection` 구조체를 만듭시다.

```rust
pub struct Projection {
    aspect: f32,
    fovy: Rad<f32>,
    znear: f32,
    zfar: f32,
}

impl Projection {
    pub fn new<F: Into<Rad<f32>>>(
        width: u32,
        height: u32,
        fovy: F,
        znear: f32,
        zfar: f32,
    ) -> Self {
        Self {
            aspect: width as f32 / height as f32,
            fovy: fovy.into(),
            znear,
            zfar,
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.aspect = width as f32 / height as f32;
    }

    pub fn calc_matrix(&self) -> Matrix4<f32> {
        OPENGL_TO_WGPU_MATRIX * perspective(self.fovy, self.aspect, self.znear, self.zfar)
    }
}
```

한 가지 주목할 점: `cgmath`는 현재 `perspective` 함수에서 오른손 좌표계(right-handed) 투영 행렬을 반환합니다. 이는 z축이 화면 밖으로 나오는 방향을 의미합니다. 만약 z축이 화면 *안으로* 들어가는 방향(즉, 왼손 좌표계 투영 행렬)을 원한다면, 직접 코드를 작성해야 합니다.

오른손 좌표계와 왼손 좌표계의 차이는 여러분의 손으로 구별할 수 있습니다. 엄지손가락을 오른쪽으로 향하게 하세요. 이것이 x축입니다. 집게손가락을 위로 향하게 하세요. 이것이 y축입니다. 가운뎃손가락을 펴세요. 이것이 z축입니다. 오른손에서는 가운뎃손가락이 여러분 쪽을 향할 것입니다. 왼손에서는 반대 방향을 향할 것입니다.

![./left_right_hand.gif](./left_right_hand.gif)

# 카메라 컨트롤러

카메라가 달라졌으므로, 새로운 카메라 컨트롤러가 필요합니다. 다음 코드를 `camera.rs`에 추가하세요.

```rust
#[derive(Debug)]
pub struct CameraController {
    amount_left: f32,
    amount_right: f32,
    amount_forward: f32,
    amount_backward: f32,
    amount_up: f32,
    amount_down: f32,
    rotate_horizontal: f32,
    rotate_vertical: f32,
    scroll: f32,
    speed: f32,
    sensitivity: f32,
}

impl CameraController {
    pub fn new(speed: f32, sensitivity: f32) -> Self {
        Self {
            amount_left: 0.0,
            amount_right: 0.0,
            amount_forward: 0.0,
            amount_backward: 0.0,
            amount_up: 0.0,
            amount_down: 0.0,
            rotate_horizontal: 0.0,
            rotate_vertical: 0.0,
            scroll: 0.0,
            speed,
            sensitivity,
        }
    }

    pub fn process_keyboard(&mut self, key: VirtualKeyCode, state: ElementState) -> bool{
        let amount = if state == ElementState::Pressed { 1.0 } else { 0.0 };
        match key {
            VirtualKeyCode::W | VirtualKeyCode::Up => {
                self.amount_forward = amount;
                true
            }
            VirtualKeyCode::S | VirtualKeyCode::Down => {
                self.amount_backward = amount;
                true
            }
            VirtualKeyCode::A | VirtualKeyCode::Left => {
                self.amount_left = amount;
                true
            }
            VirtualKeyCode::D | VirtualKeyCode::Right => {
                self.amount_right = amount;
                true
            }
            VirtualKeyCode::Space => {
                self.amount_up = amount;
                true
            }
            VirtualKeyCode::LShift => {
                self.amount_down = amount;
                true
            }
            _ => false,
        }
    }

    pub fn process_mouse(&mut self, mouse_dx: f64, mouse_dy: f64) {
        self.rotate_horizontal = mouse_dx as f32;
        self.rotate_vertical = mouse_dy as f32;
    }

    pub fn process_scroll(&mut self, delta: &MouseScrollDelta) {
        self.scroll = -match delta {
            // 한 줄(line)은 대략 100픽셀이라고 가정합니다.
            MouseScrollDelta::LineDelta(_, scroll) => scroll * 100.0,
            MouseScrollDelta::PixelDelta(PhysicalPosition {
                y: scroll,
                ..
            }) => *scroll as f32,
        };
    }

    pub fn update_camera(&mut self, camera: &mut Camera, dt: Duration) {
        let dt = dt.as_secs_f32();

        // 앞/뒤 및 좌/우 이동
        let (yaw_sin, yaw_cos) = camera.yaw.0.sin_cos();
        let forward = Vector3::new(yaw_cos, 0.0, yaw_sin).normalize();
        let right = Vector3::new(-yaw_sin, 0.0, yaw_cos).normalize();
        camera.position += forward * (self.amount_forward - self.amount_backward) * self.speed * dt;
        camera.position += right * (self.amount_right - self.amount_left) * self.speed * dt;

        // 안/밖으로 이동 (소위 "줌")
        // 참고: 이것은 실제 줌이 아닙니다. 줌을 할 때 카메라의 위치가
        // 변경됩니다. 초점을 맞추고 싶은 객체에 더 쉽게
        // 다가갈 수 있도록 추가했습니다.
        let (pitch_sin, pitch_cos) = camera.pitch.0.sin_cos();
        let scrollward = Vector3::new(pitch_cos * yaw_cos, pitch_sin, pitch_cos * yaw_sin).normalize();
        camera.position += scrollward * self.scroll * self.speed * self.sensitivity * dt;
        self.scroll = 0.0;

        // 위/아래 이동. 롤(roll)은 사용하지 않으므로,
        // y 좌표를 직접 수정할 수 있습니다.
        camera.position.y += (self.amount_up - self.amount_down) * self.speed * dt;

        // 회전
        camera.yaw += Rad(self.rotate_horizontal) * self.sensitivity * dt;
        camera.pitch += Rad(-self.rotate_vertical) * self.sensitivity * dt;

        // `process_mouse`가 매 프레임 호출되지 않으면 이 값들이
        // 0으로 설정되지 않아, 대각선 방향으로 움직일 때
        // 카메라가 회전하게 됩니다.
        self.rotate_horizontal = 0.0;
        self.rotate_vertical = 0.0;

        // 카메라의 각도가 너무 높아지거나 낮아지지 않도록 제한합니다.
        if camera.pitch < -Rad(SAFE_FRAC_PI_2) {
            camera.pitch = -Rad(SAFE_FRAC_PI_2);
        } else if camera.pitch > Rad(SAFE_FRAC_PI_2) {
            camera.pitch = Rad(SAFE_FRAC_PI_2);
        }
    }
}
```

## `lib.rs` 정리하기

가장 먼저, `lib.rs`에서 기존의 `Camera`와 `CameraController`, 그리고 불필요해진 `OPENGL_TO_WGPU_MATRIX`를 삭제해야 합니다. 삭제한 후, `camera.rs`를 가져오세요.

```rust
mod model;
mod texture;
mod camera; // NEW!
```

`update_view_proj`가 새로운 `Camera`와 `Projection`을 사용하도록 업데이트해야 합니다.

```rust
impl CameraUniform {
    // ...

    // UPDATED!
    fn update_view_proj(&mut self, camera: &camera::Camera, projection: &camera::Projection) {
        self.view_position = camera.position.to_homogeneous().into();
        self.view_proj = (projection.calc_matrix() * camera.calc_matrix()).into();
    }
}
```

`State` 구조체도 `Camera`와 `Projection`, `CameraController`를 사용하도록 변경해야 합니다. 또한 마우스 버튼이 눌렸는지 여부를 저장하기 위해 `mouse_pressed` 필드를 추가합니다.

```rust
pub struct State {
    // ...
    camera: camera::Camera, // UPDATED!
    projection: camera::Projection, // NEW!
    camera_controller: camera::CameraController, // UPDATED!
    // ...
    // NEW!
    mouse_pressed: bool,
}
```

아직 `winit::dpi::PhysicalPosition`을 임포트하지 않았다면 추가해야 합니다.

`new()` 함수도 업데이트해야 합니다.

```rust
impl State {
    async fn new(window: Arc<Window>) -> anyhow::Result<Self> {
        // ...

        // UPDATED!
        let camera = camera::Camera::new((0.0, 5.0, 10.0), cgmath::Deg(-90.0), cgmath::Deg(-20.0));
        let projection = camera::Projection::new(config.width, config.height, cgmath::Deg(45.0), 0.1, 100.0);
        let camera_controller = camera::CameraController::new(4.0, 0.4);

        // ...

        camera_uniform.update_view_proj(&camera, &projection); // UPDATED!

        // ...

        Self {
            // ...
            camera,
            projection, // NEW!
            camera_controller,
            // ...
            mouse_pressed: false, // NEW!
        }
    }
}
```

`resize` 함수에서 `projection`도 변경해야 합니다.

```rust
fn resize(&mut self, width: u32, height: u32) {
    // UPDATED!
    self.projection.resize(width, height);
    // ...
}
```

`input()` 함수도 업데이트해야 합니다. 지금까지는 카메라 제어에 `WindowEvent`를 사용했습니다. 이것도 작동은 하지만 최상의 해결책은 아닙니다. [winit 문서](https://docs.rs/winit/0.24.0/winit/event/enum.WindowEvent.html?search=#variant.CursorMoved)에 따르면, OS는 `CursorMoved` 이벤트에 대해 커서 가속과 같은 효과를 적용하기 위해 데이터를 변형하는 경우가 많습니다.

이 문제를 해결하기 위해 `input()` 함수가 `WindowEvent` 대신 `DeviceEvent`를 처리하도록 변경할 수 있지만, 키보드 및 버튼 입력은 macOS와 WASM에서 `DeviceEvent`로 발생하지 않습니다. 대신 `input()`에서 `CursorMoved` 확인을 제거하고, `run()` 함수에서 `camera_controller.process_mouse()`를 수동으로 호출하도록 하겠습니다.

```rust
// UPDATED!
fn input(&mut self, event: &WindowEvent) -> bool {
    match event {
        WindowEvent::KeyboardInput {
            event:
                KeyEvent {
                    physical_key: PhysicalKey::Code(key),
                    state,
                    ..
                },
            ..
        } => self.camera_controller.process_keyboard(*key, *state),
        WindowEvent::MouseWheel { delta, .. } => {
            self.camera_controller.process_scroll(delta);
            true
        }
        WindowEvent::MouseInput {
            button: MouseButton::Left,
            state,
            ..
        } => {
            self.mouse_pressed = *state == ElementState::Pressed;
            true
        }
        _ => false,
    }
}
```

`run()` 함수의 변경 사항은 다음과 같습니다.

```rust
fn main() {
    // ...
    event_loop.run(move |event, control_flow| {
        match event {
            // ...
            // NEW!
            Event::DeviceEvent {
                event: DeviceEvent::MouseMotion{ delta, },
                .. // 현재 device_id는 사용하지 않습니다.
            } => if state.mouse_pressed {
                state.camera_controller.process_mouse(delta.0, delta.1)
            }
            // UPDATED!
            Event::WindowEvent {
                ref event,
                window_id,
            } if window_id == state.window().id() && !state.input(event) => {
                match event {
                    #[cfg(not(target_arch="wasm32"))]
                    WindowEvent::CloseRequested
                    | WindowEvent::KeyboardInput {
                        event:
                            KeyEvent {
                                state: ElementState::Pressed,
                                physical_key: PhysicalKey::Code(KeyCode::Escape),
                                ..
                            },
                        ..
                    } => control_flow.exit(),
                    WindowEvent::Resized(physical_size) => {
                        state.resize(*physical_size);
                    }
                    WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                        state.resize(**new_inner_size);
                    }
                    _ => {}
                }
            }
            // ...
        }
    });
}
```

`update` 함수는 약간의 추가 설명이 필요합니다. `CameraController`의 `update_camera` 함수에는 `dt: Duration` 매개변수가 있는데, 이는 델타 타임(delta time) 또는 프레임 간의 시간을 의미합니다. 이는 프레임레이트에 종속되지 않고 카메라 움직임을 부드럽게 만들기 위함입니다. 현재 `dt`를 계산하고 있지 않으므로, `update` 함수에 매개변수로 전달하도록 하겠습니다.

```rust
fn update(&mut self, dt: instant::Duration) {
    // UPDATED!
    self.camera_controller.update_camera(&mut self.camera, dt);
    self.camera_uniform.update_view_proj(&self.camera, &self.projection);

    // ..
}
```

이왕 하는 김에, 빛의 회전에도 `dt`를 사용합시다.

```rust
self.light_uniform.position =
    (cgmath::Quaternion::from_axis_angle((0.0, 1.0, 0.0).into(), cgmath::Deg(60.0 * dt.as_secs_f32()))
    * old_position).into(); // UPDATED!
```

아직 `dt`를 계산해야 합니다. `main` 함수에서 계산하도록 합시다.

```rust
fn main() {
    // ...
    let mut state = State::new(&window).await;
    let mut last_render_time = instant::Instant::now();  // NEW!
    event_loop.run(move |event, control_flow| {
        match event {
            // ...
            // UPDATED!
            Event::RedrawRequested(window_id) if window_id == state.window().id() => {
                let now = instant::Instant::now();
                let dt = now - last_render_time;
                last_render_time = now;
                state.update(dt);
                // ...
            }
            _ => {}
        }
    });
}
```

이제 우리는 원하는 곳 어디로든 카메라를 움직일 수 있게 되었습니다.

![./screenshot.png](./screenshot.png)

## 데모

<WasmExample example="tutorial12_camera"></WasmExample>

<AutoGithubLink/>

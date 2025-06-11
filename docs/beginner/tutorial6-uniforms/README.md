# 유니폼 버퍼와 3D 카메라

이전의 모든 작업이 2D처럼 보였지만, 사실 우리는 계속 3D 환경에서 작업해 왔습니다! 저희의 `Vertex` 구조체에서 `position`이 2개가 아닌 3개의 `f32` 배열인 이유도 바로 그 때문입니다. 지금까지는 장면을 정면에서 바라보고 있었기 때문에 3D 공간감을 제대로 느낄 수 없었습니다. 이제 `Camera`를 만들어 시점을 바꿔보겠습니다.

## 원근 카메라 (A perspective camera)

이 튜토리얼은 선형대수학보다는 wgpu 사용법을 배우는 데 더 중점을 두므로, 관련된 많은 수학적 내용은 간략하게 넘어가겠습니다. 내부 동작 원리에 관심이 있다면 온라인에서 많은 자료를 찾아보실 수 있습니다. 저희는 [cgmath](https://docs.rs/cgmath)를 사용해 모든 수학 계산을 처리할 것입니다. `Cargo.toml`에 다음 의존성을 추가하세요.

```toml
[dependencies]
# other deps...
cgmath = "0.18"
```

이제 수학 라이브러리가 생겼으니 사용해 봅시다! `State` 구조체 위에 `Camera` 구조체를 만드세요.

```rust
struct Camera {
    eye: cgmath::Point3<f32>,
    target: cgmath::Point3<f32>,
    up: cgmath::Vector3<f32>,
    aspect: f32,
    fovy: f32,
    znear: f32,
    zfar: f32,
}

impl Camera {
    fn build_view_projection_matrix(&self) -> cgmath::Matrix4<f32> {
        // 1.
        let view = cgmath::Matrix4::look_at_rh(self.eye, self.target, self.up);
        // 2.
        let proj = cgmath::perspective(cgmath::Deg(self.fovy), self.aspect, self.znear, self.zfar);

        // 3.
        return OPENGL_TO_WGPU_MATRIX * proj * view;
    }
}
```

`build_view_projection_matrix` 함수에서 마법이 일어납니다.
1. `view` 행렬은 월드(world)를 카메라의 위치와 회전에 맞게 이동시킵니다. 본질적으로 이는 카메라의 변환 행렬(transform matrix)을 반대로 적용한 것과 같습니다.
2. `proj` 행렬은 장면을 왜곡하여 깊이감을 주는 효과를 냅니다. 이 행렬이 없으면 가까이 있는 물체와 멀리 있는 물체가 같은 크기로 보일 것입니다.
3. Wgpu의 좌표계는 DirectX와 Metal의 좌표계를 기반으로 합니다. 이는 [정규화된 디바이스 좌표계](https://github.com/gfx-rs/gfx/tree/master/src/backend/dx12#normalized-coordinates)(normalized device coordinates)에서 x축과 y축은 -1.0에서 +1.0 범위, z축은 0.0에서 +1.0 범위라는 것을 의미합니다. `cgmath` 크레이트(대부분의 게임 수학 라이브러리와 마찬가지로)는 OpenGL의 좌표계를 기준으로 만들어졌습니다. 아래 행렬은 OpenGL 좌표계의 장면을 WGPU의 좌표계로 스케일링하고 변환하는 역할을 합니다. 다음과 같이 정의하겠습니다.

```rust
#[rustfmt::skip]
pub const OPENGL_TO_WGPU_MATRIX: cgmath::Matrix4<f32> = cgmath::Matrix4::from_cols(
    cgmath::Vector4::new(1.0, 0.0, 0.0, 0.0),
    cgmath::Vector4::new(0.0, 1.0, 0.0, 0.0),
    cgmath::Vector4::new(0.0, 0.0, 0.5, 0.0),
    cgmath::Vector4::new(0.0, 0.0, 0.5, 1.0),
);
```

*   참고: `OPENGL_TO_WGPU_MATRIX`가 반드시 **필요한** 것은 아니지만, 이 행렬을 사용하지 않으면 (0, 0, 0)에 중심을 둔 모델들이 클리핑 영역의 절반 안쪽에 위치하게 됩니다. 이는 카메라 행렬을 사용하지 않을 경우에만 문제가 됩니다.

이제 `State`에 `camera` 필드를 추가합시다.

```rust
pub struct State {
    // ...
    camera: Camera,
    // ...
}

async fn new(window: Window) -> Self {
    // let diffuse_bind_group ...

    let camera = Camera {
        // 카메라를 위로 1 유닛, 뒤로 2 유닛 이동
        // +z는 화면 바깥쪽 방향입니다
        eye: (0.0, 1.0, 2.0).into(),
        // 원점을 바라보게 함
        target: (0.0, 0.0, 0.0).into(),
        // "위" 방향을 정의
        up: cgmath::Vector3::unit_y(),
        aspect: config.width as f32 / config.height as f32,
        fovy: 45.0,
        znear: 0.1,
        zfar: 100.0,
    };

    Self {
        // ...
        camera,
        // ...
    }
}
```

이제 카메라가 생겼고, 뷰-투영 행렬(view projection matrix)을 만들 수 있게 되었으니, 이 행렬을 어딘가에 저장해야 합니다. 또한, 이 데이터를 셰이더로 전달할 방법도 필요합니다.

## 유니폼 버퍼 (The uniform buffer)

지금까지 우리는 정점(vertex)과 인덱스(index) 데이터를 저장하고 텍스처를 로드하기 위해 `Buffer`를 사용했습니다. 이제 다시 버퍼를 사용하여 유니폼 버퍼(uniform buffer)라는 것을 만들 것입니다. 유니폼(uniform)은 셰이더의 모든 호출에서 사용할 수 있는 데이터 덩어리입니다. 사실, 우리는 이미 텍스처와 샘플러에 유니폼을 사용했습니다. 이번에는 뷰-투영 행렬을 저장하기 위해 유니폼을 다시 사용할 것입니다. 먼저 유니폼을 담을 구조체를 만듭시다.

```rust
// Rust가 셰이더를 위해 데이터를 올바르게 저장하도록 하는 데 필요합니다
#[repr(C)]
// 이 구조체를 버퍼에 저장할 수 있도록 합니다
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct CameraUniform {
    // cgmath를 bytemuck과 직접 사용할 수 없으므로,
    // Matrix4를 4x4 f32 배열로 변환해야 합니다
    view_proj: [[f32; 4]; 4],
}

impl CameraUniform {
    fn new() -> Self {
        use cgmath::SquareMatrix;
        Self {
            view_proj: cgmath::Matrix4::identity().into(),
        }
    }

    fn update_view_proj(&mut self, camera: &Camera) {
        self.view_proj = camera.build_view_projection_matrix().into();
    }
}
```

이제 데이터 구조가 준비되었으니, `camera_buffer`를 만들어 봅시다.

```rust
// new() 함수에서 camera를 만든 후

let mut camera_uniform = CameraUniform::new();
camera_uniform.update_view_proj(&camera);

let camera_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Camera Buffer"),
        contents: bytemuck::cast_slice(&[camera_uniform]),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    }
);
```

## 유니폼 버퍼와 바인드 그룹

좋습니다! 이제 유니폼 버퍼가 생겼으니, 무엇을 해야 할까요? 정답은 바인드 그룹(bind group)을 만드는 것입니다. 먼저, 바인드 그룹 레이아웃을 만들어야 합니다.

```rust
let camera_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
    entries: &[
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }
    ],
    label: Some("camera_bind_group_layout"),
});
```

몇 가지 주목할 점:

1.  `visibility`를 `ShaderStages::VERTEX`로 설정했습니다. 정점을 조작하는 데 카메라 정보가 사용되므로, 정점 셰이더에서만 필요하기 때문입니다.
2.  `has_dynamic_offset`은 버퍼 내 데이터의 위치가 바뀔 수 있음을 의미합니다. 단일 버퍼에 크기가 다른 여러 데이터 세트를 저장하는 경우에 해당합니다. 이 값을 `true`로 설정하면 나중에 오프셋을 제공해야 합니다.
3.  `min_binding_size`는 버퍼가 가질 수 있는 최소 크기를 지정합니다. 필수로 지정할 필요는 없으므로 `None`으로 둡니다. 더 자세한 정보는 [문서](https://docs.rs/wgpu/latest/wgpu/enum.BindingType.html#variant.Buffer.field.min_binding_size)를 확인하세요.

이제 실제 바인드 그룹을 만들 수 있습니다.

```rust
let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
    layout: &camera_bind_group_layout,
    entries: &[
        wgpu::BindGroupEntry {
            binding: 0,
            resource: camera_buffer.as_entire_binding(),
        }
    ],
    label: Some("camera_bind_group"),
});
```

텍스처와 마찬가지로, `camera_bind_group_layout`을 렌더 파이프라인에 등록해야 합니다.

```rust
let render_pipeline_layout = device.create_pipeline_layout(
    &wgpu::PipelineLayoutDescriptor {
        label: Some("Render Pipeline Layout"),
        bind_group_layouts: &[
            &texture_bind_group_layout,
            &camera_bind_group_layout,
        ],
        push_constant_ranges: &[],
    }
);
```

이제 `camera_buffer`와 `camera_bind_group`을 `State`에 추가해야 합니다.

```rust
pub struct State {
    // ...
    camera: Camera,
    camera_uniform: CameraUniform,
    camera_buffer: wgpu::Buffer,
    camera_bind_group: wgpu::BindGroup,
}

async fn new(window: Window) -> Self {
    // ...
    Self {
        // ...
        camera,
        camera_uniform,
        camera_buffer,
        camera_bind_group,
    }
}
```

셰이더 작업을 시작하기 전에 마지막으로 할 일은 `render()`에서 이 바인드 그룹을 사용하는 것입니다.

```rust
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]);
// NEW!
render_pass.set_bind_group(1, &self.camera_bind_group, &[]);
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);

render_pass.draw_indexed(0..self.num_indices, 0, 0..1);
```

## 정점 셰이더에서 유니폼 사용하기

정점 셰이더를 다음과 같이 수정하세요.

```wgsl
// Vertex shader
struct CameraUniform {
    view_proj: mat4x4<f32>,
};
@group(1) @binding(0) // 1.
var<uniform> camera: CameraUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) tex_coords: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) tex_coords: vec2<f32>,
}

@vertex
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var out: VertexOutput;
    out.tex_coords = model.tex_coords;
    out.clip_position = camera.view_proj * vec4<f32>(model.position, 1.0); // 2.
    return out;
}
```

1.  새로운 바인드 그룹을 만들었기 때문에, 셰이더에서 어떤 그룹을 사용할지 지정해야 합니다. 이 숫자는 `render_pipeline_layout`에 의해 결정됩니다. `texture_bind_group_layout`이 먼저 나열되었으므로 `group(0)`이고, `camera_bind_group`이 두 번째이므로 `group(1)`입니다.
2.  행렬 곱셈에서는 순서가 중요합니다. 벡터는 오른쪽에, 행렬은 중요도 순서에 따라 왼쪽에 배치됩니다.

## 카메라를 위한 컨트롤러

지금 코드를 실행하면 다음과 같은 화면이 나타날 것입니다.

![./static-tree.png](./static-tree.png)

도형이 덜 늘어나 보이지만, 여전히 정적입니다. 카메라 위치를 바꿔가며 실험해 볼 수 있지만, 대부분의 게임에서 카메라는 움직입니다. 이 튜토리얼은 wgpu 사용법에 관한 것이지 사용자 입력 처리에 관한 것이 아니므로, 아래에 `CameraController` 코드를 바로 첨부하겠습니다.

```rust
struct CameraController {
    speed: f32,
    is_forward_pressed: bool,
    is_backward_pressed: bool,
    is_left_pressed: bool,
    is_right_pressed: bool,
}

impl CameraController {
    fn new(speed: f32) -> Self {
        Self {
            speed,
            is_forward_pressed: false,
            is_backward_pressed: false,
            is_left_pressed: false,
            is_right_pressed: false,
        }
    }

    fn process_events(&mut self, event: &WindowEvent) -> bool {
        match event {
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        state,
                        physical_key: PhysicalKey::Code(keycode),
                        ..
                    },
                ..
            } => {
                let is_pressed = *state == ElementState::Pressed;
                match keycode {KeyCode::KeyW | KeyCode::ArrowUp => {
                        self.is_forward_pressed = is_pressed;
                        true
                    }
                    KeyCode::KeyA | KeyCode::ArrowLeft => {
                        self.is_left_pressed = is_pressed;
                        true
                    }
                    KeyCode::KeyS | KeyCode::ArrowDown => {
                        self.is_backward_pressed = is_pressed;
                        true
                    }
                    KeyCode::KeyD | KeyCode::ArrowRight => {
                        self.is_right_pressed = is_pressed;
                        true
                    }
                    _ => false,
                }
            }
            _ => false,
        }
    }

    fn update_camera(&self, camera: &mut Camera) {
        use cgmath::InnerSpace;
        let forward = camera.target - camera.eye;
        let forward_norm = forward.normalize();
        let forward_mag = forward.magnitude();

        // 카메라가 장면의 중심에 너무 가까워졌을 때
        // 발생하는 글리치 현상을 방지합니다.
        if self.is_forward_pressed && forward_mag > self.speed {
            camera.eye += forward_norm * self.speed;
        }
        if self.is_backward_pressed {
            camera.eye -= forward_norm * self.speed;
        }

        let right = forward_norm.cross(camera.up);

        // 앞/뒤 이동 키가 눌렸을 경우를 대비해 반지름을 다시 계산합니다.
        let forward = camera.target - camera.eye;
        let forward_mag = forward.magnitude();

        if self.is_right_pressed {
            // 타겟과 눈 사이의 거리가 변하지 않도록 재조정합니다.
            // 따라서 눈은 여전히 타겟과 눈이 만드는 원 위에 놓이게 됩니다.
            camera.eye = camera.target - (forward + right * self.speed).normalize() * forward_mag;
        }
        if self.is_left_pressed {
            camera.eye = camera.target - (forward - right * self.speed).normalize() * forward_mag;
        }
    }
}
```

이 코드는 완벽하지 않습니다. 회전할 때 카메라가 서서히 뒤로 움직이는 문제가 있습니다. 하지만 이 튜토리얼의 목적에는 충분합니다. 자유롭게 개선해 보세요!

이제 이 코드를 기존 코드에 연결해야 합니다. `State`에 컨트롤러를 추가하고 `new()`에서 생성하세요.

```rust
pub struct State {
    // ...
    camera: Camera,
    // NEW!
    camera_controller: CameraController,
    // ...
}
// ...
impl State {
    async fn new(window: Arc<Window>) -> anyhow::Result<State> {
        // ...
        let camera_controller = CameraController::new(0.2);
        // ...

        Self {
            // ...
            camera_controller,
            // ...
        }
    }
}
```

드디어 `input()`에 코드를 추가할 시간입니다! (아직 추가하지 않으셨다면)

```rust
fn input(&mut self, event: &WindowEvent) -> bool {
    self.camera_controller.process_events(event)
}
```

지금까지 카메라 컨트롤러는 실제로 아무것도 하지 않았습니다. 유니폼 버퍼의 값을 업데이트해야 합니다. 이를 위한 몇 가지 주요 방법이 있습니다.

1.  별도의 버퍼를 만들어 그 내용을 `camera_buffer`로 복사하는 방법입니다. 이 새 버퍼를 스테이징 버퍼(staging buffer)라고 합니다. 이 방법은 보통 `camera_buffer`와 같은 주 버퍼의 내용을 GPU만 접근할 수 있게 하므로 일반적으로 사용됩니다. 이를 통해 GPU는 CPU가 버퍼에 접근할 수 있을 때는 불가능한 몇 가지 속도 최적화를 수행할 수 있습니다.
2.  버퍼 자체에 `map_read_async`나 `map_write_async`와 같은 매핑 메서드를 호출하는 방법입니다. 이를 통해 버퍼의 내용에 직접 접근할 수 있지만, 이러한 메서드의 `async`적인 측면을 다루어야 합니다. 또한 버퍼에 `BufferUsages::MAP_READ`나 `BufferUsages::MAP_WRITE` 사용 플래그가 필요합니다. 여기서는 다루지 않지만, 더 알고 싶다면 [창 없는 Wgpu](../../showcase/windowless) 튜토리얼을 확인하세요.
3.  `queue`의 `write_buffer`를 사용하는 방법입니다.

우리는 세 번째 방법을 사용할 것입니다.

```rust
fn update(&mut self) {
    self.camera_controller.update_camera(&mut self.camera);
    self.camera_uniform.update_view_proj(&self.camera);
    self.queue.write_buffer(&self.camera_buffer, 0, bytemuck::cast_slice(&[self.camera_uniform]));
}
```

이것이 우리가 해야 할 전부입니다. 이제 코드를 실행하면, wasd/화살표 키로 회전하고 확대/축소할 수 있는 나무 텍스처가 입혀진 오각형이 보일 것입니다.

## 데모

<WasmExample example="tutorial6_uniforms"></WasmExample>

<AutoGithubLink/>

## 도전 과제

카메라와 독립적으로 모델이 스스로 회전하도록 만들어 보세요. *힌트: 이를 위해 또 다른 행렬이 필요할 것입니다.*

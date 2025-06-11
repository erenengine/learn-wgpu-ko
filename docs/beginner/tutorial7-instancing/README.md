# 인스턴싱(Instancing)

지금까지 우리의 씬은 매우 단순했습니다: (0,0,0)에 중앙에 위치한 객체 하나만 있었죠. 만약 더 많은 객체를 원한다면 어떻게 해야 할까요? 이럴 때 인스턴싱이 사용됩니다.

인스턴싱은 동일한 객체를 다른 속성(위치, 방향, is_surface_configured: false, 색상 등)으로 여러 번 그릴 수 있게 해줍니다. 인스턴싱을 구현하는 방법은 여러 가지가 있습니다. 한 가지 방법은 유니폼 버퍼를 수정하여 이러한 속성들을 포함시키고, 각 객체의 인스턴스를 그리기 전에 버퍼를 업데이트하는 것입니다.

하지만 성능상의 이유로 이 방법을 사용하고 싶지 않습니다. 각 인스턴스마다 유니폼 버퍼를 업데이트하려면 프레임마다 여러 번의 버퍼 복사가 필요하기 때문입니다. 게다가, 현재 우리가 유니폼 버퍼를 업데이트하는 방식은 업데이트된 데이터를 저장하기 위해 새로운 버퍼를 생성해야 합니다. 이는 드로우 콜(draw call) 사이에 많은 시간을 낭비하게 됩니다.

만약 `draw_indexed` 함수의 매개변수([wgpu 문서](https://docs.rs/wgpu/latest/wgpu/struct.RenderPass.html#method.draw_indexed) 참조)를 살펴보면, 우리 문제에 대한 해결책을 찾을 수 있습니다.

```rust
pub fn draw_indexed(
    &mut self,
    indices: Range<u32>,
    base_vertex: i32,
    instances: Range<u32> // <-- 바로 이 부분입니다
)
```

`instances` 매개변수는 `Range<u32>`를 받습니다. 이 매개변수는 GPU에게 모델의 복사본, 즉 인스턴스를 몇 개나 그릴지 알려줍니다. 현재 우리는 `0..1`을 지정하고 있는데, 이는 GPU에게 모델을 한 번 그리고 멈추라고 지시하는 것입니다. 만약 `0..5`를 사용한다면, 우리 코드는 다섯 개의 인스턴스를 그릴 것입니다.

`instances`가 `Range<u32>`라는 점이 이상하게 보일 수 있습니다. `1..2`를 사용해도 여전히 객체의 인스턴스 하나만 그리기 때문이죠. 그냥 `u32`를 쓰는 게 더 간단해 보이지 않나요? 그렇죠? 범위를 사용하는 이유는 때때로 우리가 가진 **모든** 객체를 그리고 싶지 않기 때문입니다. 때로는 다른 객체들이 프레임 밖에 있거나, 디버깅 중 특정 인스턴스 집합만 보고 싶을 때 일부만 그리기를 원할 수 있습니다.

자, 이제 객체의 여러 인스턴스를 그리는 방법을 알았습니다. 그렇다면 wgpu에게 어떤 특정 인스턴스를 그려야 하는지는 어떻게 알려줄까요? 우리는 인스턴스 버퍼(instance buffer)라는 것을 사용할 것입니다.

## 인스턴스 버퍼

유니폼 버퍼를 만들었던 것과 비슷하게 인스턴스 버퍼를 만들 것입니다. 먼저 `Instance`라는 구조체를 만들겠습니다.

```rust
// lib.rs
// ...

// NEW!
struct Instance {
    position: cgmath::Vector3<f32>,
    rotation: cgmath::Quaternion<f32>,
}
```

<div class="note">

`쿼터니언(Quaternion)`은 회전을 표현하는 데 자주 사용되는 수학적 구조체입니다. 쿼터니언의 수학적 원리는 제 수준을 넘어서므로(허수와 4차원 공간을 다룹니다), 여기서 다루지는 않겠습니다. 정말 깊이 파고들고 싶다면 [여기 Wolfram Alpha 아티클](https://mathworld.wolfram.com/Quaternion.html)을 참조하세요.

</div>

이 값들을 셰이더에서 직접 사용하는 것은 번거로울 것입니다. 쿼터니언에 대응하는 WGSL 타입이 없기 때문입니다. 셰이더에서 직접 수학 계산을 하고 싶지는 않으니, `Instance` 데이터를 행렬로 변환하여 `InstanceRaw`라는 구조체에 저장하겠습니다.

```rust
// NEW!
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct InstanceRaw {
    model: [[f32; 4]; 4],
}
```

이것이 `wgpu::Buffer`에 들어갈 데이터입니다. 이 둘을 분리해두면 `Instance`를 원하는 만큼 업데이트하면서도 행렬을 다룰 필요가 없어집니다. 우리는 그리기 전에 raw 데이터만 업데이트하면 됩니다.

이제 `Instance`에 `InstanceRaw`로 변환하는 메서드를 만듭시다.

```rust
// NEW!
impl Instance {
    fn to_raw(&self) -> InstanceRaw {
        InstanceRaw {
            model: (cgmath::Matrix4::from_translation(self.position) * cgmath::Matrix4::from(self.rotation)).into(),
        }
    }
}
```

이제 `State`에 `instances`와 `instance_buffer` 두 필드를 추가해야 합니다.

```rust
pub struct State {
    instances: Vec<Instance>,
    instance_buffer: wgpu::Buffer,
}
```

`cgmath` 크레이트는 `Vector3`와 같은 구조체 전반에 걸쳐 공통적인 수학 메서드를 제공하기 위해 트레이트(trait)를 사용하는데, 이 메서드들을 사용하려면 먼저 임포트해야 합니다. 편의를 위해, 크레이트 내의 `prelude` 모듈은 임포트 시 가장 일반적인 확장 트레이트들을 제공합니다.

이 prelude 모듈을 임포트하려면 `lib.rs` 상단에 다음 줄을 추가하세요.

```rust
use cgmath::prelude::*;
```

인스턴스를 `new()`에서 생성하겠습니다. 일을 단순화하기 위해 몇 가지 상수를 사용하겠습니다. 인스턴스를 10x10 행렬로 표시하고, 일정한 간격으로 배치할 것입니다.

```rust
const NUM_INSTANCES_PER_ROW: u32 = 10;
const INSTANCE_DISPLACEMENT: cgmath::Vector3<f32> = cgmath::Vector3::new(NUM_INSTANCES_PER_ROW as f32 * 0.5, 0.0, NUM_INSTANCES_PER_ROW as f32 * 0.5);
```

이제 실제 인스턴스를 생성할 수 있습니다.

```rust
impl State {
    async fn new(window: Arc<Window>) -> anyhow::Result<State> {
        // ...
        let instances = (0..NUM_INSTANCES_PER_ROW).flat_map(|z| {
            (0..NUM_INSTANCES_PER_ROW).map(move |x| {
                let position = cgmath::Vector3 { x: x as f32, y: 0.0, z: z as f32 } - INSTANCE_DISPLACEMENT;

                let rotation = if position.is_zero() {
                    // 쿼터니언이 올바르게 생성되지 않으면 스케일에 영향을 줄 수 있으므로,
                    // (0, 0, 0)에 있는 객체가 0으로 스케일링되는 것을 방지하기 위해 필요합니다.
                    cgmath::Quaternion::from_axis_angle(cgmath::Vector3::unit_z(), cgmath::Deg(0.0))
                } else {
                    cgmath::Quaternion::from_axis_angle(position.normalize(), cgmath::Deg(45.0))
                };

                Instance {
                    position, rotation,
                }
            })
        }).collect::<Vec<_>>();
        // ...
    }
}
```

데이터가 준비되었으니, 실제 `instance_buffer`를 생성할 수 있습니다.

```rust
let instance_data = instances.iter().map(Instance::to_raw).collect::<Vec<_>>();
let instance_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Instance Buffer"),
        contents: bytemuck::cast_slice(&instance_data),
        usage: wgpu::BufferUsages::VERTEX,
    }
);
```

`InstanceRaw`를 위한 새로운 `VertexBufferLayout`을 만들어야 합니다.

```rust
impl InstanceRaw {
    fn desc() -> wgpu::VertexBufferLayout<'static> {
        use std::mem;
        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<InstanceRaw>() as wgpu::BufferAddress,
            // 스텝 모드를 Vertex에서 Instance로 전환해야 합니다.
            // 이는 셰이더가 새로운 인스턴스 처리를 시작할 때만 다음
            // 인스턴스 데이터를 사용하도록 만듭니다.
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &[
                // mat4는 기술적으로 4개의 vec4이므로 4개의 버텍스 슬롯을 차지합니다. 각 vec4에 대한 슬롯을
                // 정의해야 합니다. 나중에 셰이더에서 mat4를 다시 조립해야 합니다.
                wgpu::VertexAttribute {
                    offset: 0,
                    // 현재 버텍스 셰이더는 location 0과 1만 사용하지만, 이후 튜토리얼에서는
                    // Vertex를 위해 2, 3, 4를 사용할 것입니다. 나중에 충돌하지 않도록 5번 슬롯부터 시작하겠습니다.
                    shader_location: 5,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 4]>() as wgpu::BufferAddress,
                    shader_location: 6,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 8]>() as wgpu::BufferAddress,
                    shader_location: 7,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 12]>() as wgpu::BufferAddress,
                    shader_location: 8,
                    format: wgpu::VertexFormat::Float32x4,
                },
            ],
        }
    }
}
```

이 디스크립터를 렌더 파이프라인에 추가하여 렌더링할 때 사용할 수 있도록 해야 합니다.

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    // ...
    vertex: wgpu::VertexState {
        // ...
        // UPDATED!
        buffers: &[Vertex::desc(), InstanceRaw::desc()],
    },
    // ...
});
```

새로운 변수들을 반환하는 것을 잊지 마세요!

```rust
Self {
    // ...
    // NEW!
    instances,
    instance_buffer,
}
```

마지막으로 변경해야 할 부분은 `render()` 메서드입니다. `instance_buffer`를 바인딩하고, `draw_indexed()`에서 사용하는 범위를 인스턴스 개수를 포함하도록 변경해야 합니다.

```rust
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]);
render_pass.set_bind_group(1, &self.camera_bind_group, &[]);
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
// NEW!
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);

// UPDATED!
render_pass.draw_indexed(0..self.num_indices, 0, 0..self.instances.len() as _);
```

<div class="warning">

**경고**: 만약 새로운 인스턴스를 `Vec`에 추가할 경우, `instance_buffer`와 `camera_bind_group`도 다시 생성해야 합니다. 그렇지 않으면 새로운 인스턴스가 올바르게 표시되지 않습니다.

</div>

`shader.wgsl`에서 새 행렬의 부분을 참조하여 인스턴스에 사용할 수 있도록 해야 합니다. `shader.wgsl`의 상단에 다음을 추가하세요.

```wgsl
struct InstanceInput {
    @location(5) model_matrix_0: vec4<f32>,
    @location(6) model_matrix_1: vec4<f32>,
    @location(7) model_matrix_2: vec4<f32>,
    @location(8) model_matrix_3: vec4<f32>,
};
```

사용하기 전에 행렬을 다시 조립해야 합니다.

```wgsl
@vertex
fn vs_main(
    model: VertexInput,
    instance: InstanceInput,
) -> VertexOutput {
    let model_matrix = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );
    // 계속...
}
```

우리는 `model_matrix`를 `camera_uniform.view_proj`를 적용하기 전에 적용할 것입니다. 이는 `camera_uniform.view_proj`가 좌표계를 `월드 공간(world space)`에서 `카메라 공간(camera space)`으로 변경하기 때문입니다. 우리의 `model_matrix`는 `월드 공간` 변환이므로, 이를 사용할 때 `카메라 공간`에 있고 싶지 않습니다.

```wgsl
@vertex
fn vs_main(
    model: VertexInput,
    instance: InstanceInput,
) -> VertexOutput {
    // ...
    var out: VertexOutput;
    out.tex_coords = model.tex_coords;
    out.clip_position = camera.view_proj * model_matrix * vec4<f32>(model.position, 1.0);
    return out;
}
```

이 모든 작업이 끝나면, 나무들로 이루어진 숲이 보일 것입니다!

![./forest.png](./forest.png)

## 데모

<WasmExample example="tutorial7_instancing"></WasmExample>

<AutoGithubLink/>

## 도전 과제

매 프레임마다 인스턴스의 위치 및/또는 회전을 수정해보세요.

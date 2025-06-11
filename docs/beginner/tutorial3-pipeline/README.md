# 파이프라인

## 파이프라인이란 무엇일까요?

OpenGL에 익숙하다면 셰이더 프로그램을 사용했던 것을 기억하실 겁니다. 파이프라인은 그것의 더 강력한(robust) 버전이라고 생각할 수 있습니다. 파이프라인은 GPU가 특정 데이터 집합에 대해 수행할 모든 작업을 설명합니다. 이 섹션에서는 특별히 `RenderPipeline`(렌더 파이프라인)을 만들어 보겠습니다.

## 잠깐, 셰이더라고요?

셰이더는 데이터에 대한 연산을 수행하기 위해 GPU로 보내는 작은 프로그램입니다. 주로 세 가지 유형의 셰이더가 있습니다: 정점(vertex), 프래그먼트(fragment), 그리고 컴퓨트(compute) 셰이더입니다. 지오메트리 셰이더나 테셀레이션 셰이더와 같은 다른 종류도 있지만, WebGL에서는 지원되지 않습니다. 이들은 일반적으로 피하는 것이 좋습니다 ([관련 토론 보기](https://community.khronos.org/t/does-the-use-of-geometric-shaders-significantly-reduce-performance/106326)). 지금은 정점 셰이더와 프래그먼트 셰이더만 사용할 것입니다.

## 정점, 프래그먼트... 그게 뭔가요?

정점(vertex)은 3D(또는 2D) 공간의 한 점입니다. 이 정점들은 2개씩 묶여 선을 이루거나, 3개씩 묶여 삼각형을 이룹니다.

<img alt="정점 그래픽" src="./tutorial3-pipeline-vertices.png" />

대부분의 최신 렌더링은 삼각형을 사용하여 간단한 도형(큐브 등)부터 복잡한 모양(사람 등)까지 모든 형태를 만듭니다. 이 삼각형들은 정점들로 저장되는데, 이 정점들은 삼각형의 각 꼭짓점을 구성하는 점들입니다.

<!-- Todo: 여기에 넣을 이미지 찾기/만들기 -->

우리는 정점 셰이더를 사용하여 정점들을 조작하고, 원하는 모양으로 변형시킵니다.

그 후 정점들은 프래그먼트(fragment)로 변환됩니다. 결과 이미지의 모든 픽셀은 최소 하나의 프래그먼트를 갖게 됩니다. 각 프래그먼트는 해당하는 픽셀에 복사될 색상을 가집니다. 프래그먼트 셰이더는 프래그먼트가 어떤 색을 가질지 결정합니다.

## WGSL

[WebGPU 셰이딩 언어(WebGPU Shading Language)](https://www.w3.org/TR/WGSL/) (WGSL)는 WebGPU를 위한 셰이더 언어입니다. WGSL의 개발은 백엔드에 해당하는 셰이더 언어로 쉽게 변환되는 것에 초점을 맞추고 있습니다. 예를 들어, Vulkan을 위한 SPIR-V, Metal을 위한 MSL, DX12를 위한 HLSL, OpenGL을 위한 GLSL로 변환됩니다. 이 변환은 내부적으로 이루어지며, 우리는 보통 세부 사항에 대해 신경 쓸 필요가 없습니다. wgpu의 경우, 이 작업은 [naga](https://github.com/gfx-rs/naga)라는 라이브러리에 의해 수행됩니다.

참고로, 이 글을 쓰는 시점에서 일부 WebGPU 구현은 SPIR-V도 지원하지만, 이는 WGSL로 전환하는 과도기 동안의 임시 조치일 뿐이며 제거될 예정입니다 (SPIR-V와 WGSL 이면의 드라마가 궁금하다면, [이 블로그 포스트](https://kvark.github.io/spirv/2021/05/01/spirv-horrors.html)를 참조하세요).

<div class="note">

이전에 이 튜토리얼을 보신 분이라면 GLSL 대신 WGSL을 사용하도록 바뀐 것을 눈치채셨을 겁니다. GLSL 지원이 부차적인 관심사이고 WGSL이 WGPU의 핵심 언어라는 점을 고려하여, 모든 튜토리얼을 WGSL을 사용하도록 전환하기로 결정했습니다. 일부 쇼케이스 예제는 여전히 GLSL을 사용하지만, 메인 튜토리얼과 앞으로의 모든 예제는 WGSL을 사용할 것입니다.

</div>

<div class="note">

WGSL 명세와 WGPU에의 포함은 아직 개발 중입니다. 사용 중 문제가 발생하면 [https://app.element.io/#/room/#wgpu:matrix.org](https://app.element.io/#/room/#wgpu:matrix.org)의 사람들에게 코드를 보여주는 것이 도움이 될 수 있습니다.

</div>

## 셰이더 작성하기

`main.rs`와 같은 폴더에 `shader.wgsl` 파일을 만듭니다. `shader.wgsl`에 다음 코드를 작성하세요.

```wgsl
// 정점 셰이더

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
};

@vertex
fn vs_main(
    @builtin(vertex_index) in_vertex_index: u32,
) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(1 - i32(in_vertex_index)) * 0.5;
    let y = f32(i32(in_vertex_index & 1u) * 2 - 1) * 0.5;
    out.clip_position = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}
```

먼저, 정점 셰이더의 출력을 저장할 `struct`(구조체)를 선언합니다. 현재는 단 하나의 필드, 즉 정점의 `clip_position`만 있습니다. `@builtin(position)` 부분은 WGPU에게 이 값을 정점의 [클립 좌표(clip coordinates)](https://en.wikipedia.org/wiki/Clip_coordinates)로 사용하라고 알려줍니다. 이는 GLSL의 `gl_Position` 변수와 유사합니다.

<div class="note">

`vec4`와 같은 벡터 타입은 제네릭입니다. 현재는 벡터가 담을 값의 타입을 명시해야 합니다. 따라서 32비트 부동소수점을 사용하는 3D 벡터는 `vec3<f32>`가 됩니다.

</div>

셰이더 코드의 다음 부분은 `vs_main` 함수입니다. `@vertex`를 사용하여 이 함수가 정점 셰이더의 유효한 진입점임을 표시합니다. 우리는 `@builtin(vertex_index)`로부터 값을 받는 `in_vertex_index`라는 `u32`를 입력으로 받습니다.

그런 다음 `VertexOutput` 구조체를 사용하여 `out`이라는 변수를 선언합니다. 그리고 삼각형의 `x`와 `y`를 위한 두 개의 다른 변수를 만듭니다.

<div class="note">

`f32()`와 `i32()` 부분은 캐스팅(casting)의 예입니다.

</div>

<div class="note">

`var`로 정의된 변수는 수정할 수 있지만 타입을 명시해야 합니다. `let`으로 생성된 변수는 타입을 추론할 수 있지만, 셰이더 내에서 값을 변경할 수 없습니다.

</div>

이제 `clip_position`을 `out`에 저장할 수 있습니다. 그리고 `out`을 반환하면 정점 셰이더가 완성됩니다!

<div class="note">

사실 이 예제에서는 구조체가 꼭 필요하지 않았고, 다음과 같이 할 수도 있었습니다:

```wgsl
@vertex
fn vs_main(
    @builtin(vertex_index) in_vertex_index: u32
) -> @builtin(position) vec4<f32> {
    // 정점 셰이더 코드...
}
```

하지만 나중에 `VertexOutput`에 더 많은 필드를 추가할 것이므로, 지금부터 사용하는 것이 좋습니다.

</div>

다음은 프래그먼트 셰이더입니다. 계속해서 `shader.wgsl`에 다음을 추가하세요:

```wgsl
// 프래그먼트 셰이더

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.3, 0.2, 0.1, 1.0);
}
```

이 코드는 현재 프래그먼트의 색상을 갈색으로 설정합니다.

<div class="note">

정점 셰이더의 진입점 이름은 `vs_main`이고 프래그먼트 셰이더의 진입점 이름은 `fs_main`인 점에 주목하세요. 이전 버전의 wgpu에서는 두 함수의 이름이 같아도 괜찮았지만, 최신 [WGSL 명세](https://www.w3.org/TR/WGSL/#declaration-and-scope)에서는 이 이름들이 달라야 합니다. 따라서, 위에서 언급한 (`wgpu` 예제에서 채택한) 명명 규칙이 이 튜토리얼 전체에서 사용됩니다.

</div>

`@location(0)` 부분은 WGPU에게 이 함수가 반환하는 `vec4` 값을 첫 번째 색상 타겟(color target)에 저장하라고 지시합니다. 이것이 무엇인지는 나중에 다루겠습니다.

<div class="note">

`@builtin(position)`에 대해 주목할 점은, 프래그먼트 셰이더에서 이 값은 [프레임버퍼 공간(framebuffer space)](https://gpuweb.github.io/gpuweb/#coordinate-systems)에 있다는 것입니다. 즉, 창 크기가 800x600이라면 `clip_position`의 x와 y는 각각 0-800, 0-600 사이의 값이 되며, y = 0이 화면의 상단입니다. 이는 특정 프래그먼트의 픽셀 좌표를 알고 싶을 때 유용할 수 있지만, 위치 좌표를 원한다면 별도로 전달해야 합니다.

```wgsl
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) vert_pos: vec3<f32>,
}

@vertex
fn vs_main(
    @builtin(vertex_index) in_vertex_index: u32,
) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(1 - i32(in_vertex_index)) * 0.5;
    let y = f32(i32(in_vertex_index & 1u) * 2 - 1) * 0.5;
    out.clip_position = vec4<f32>(x, y, 0.0, 1.0);
    out.vert_pos = out.clip_position.xyz;
    return out;
}
```

</div>

## 셰이더는 어떻게 사용하나요?

이제 드디어 제목에서 언급한 파이프라인을 만들 차례입니다. 먼저, `State`를 다음과 같이 수정하여 필드를 추가합시다.

```rust
// lib.rs
pub struct State {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    is_surface_configured: bool,
    // NEW!
    render_pipeline: wgpu::RenderPipeline,
    window: Arc<Window>,
}
```

이제 `new()` 메서드로 이동하여 파이프라인을 만들기 시작합시다. `render_pipeline`을 만들려면 이전에 만든 셰이더를 불러와야 합니다.

```rust
let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("Shader"),
    source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
});
```

<div class="note">

`include_wgsl!` 매크로를 사용하여 `ShaderModuleDescriptor`를 만드는 작은 단축키로 사용할 수도 있습니다.

```rust
let shader = device.create_shader_module(wgpu::include_wgsl!("shader.wgsl"));
```

</div>

한 가지 더, `PipelineLayout`을 만들어야 합니다. `Buffer`에 대해 다룬 후에 이 부분을 더 자세히 살펴보겠습니다.

```rust
let render_pipeline_layout =
    device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("Render Pipeline Layout"),
        bind_group_layouts: &[],
        push_constant_ranges: &[],
    });
```

드디어 `render_pipeline`을 만들 준비가 모두 끝났습니다.

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    label: Some("Render Pipeline"),
    layout: Some(&render_pipeline_layout),
    vertex: wgpu::VertexState {
        module: &shader,
        entry_point: Some("vs_main"), // 1.
        buffers: &[], // 2.
        compilation_options: wgpu::PipelineCompilationOptions::default(),
    },
    fragment: Some(wgpu::FragmentState { // 3.
        module: &shader,
        entry_point: Some("fs_main"),
        targets: &[Some(wgpu::ColorTargetState { // 4.
            format: config.format,
            blend: Some(wgpu::BlendState::REPLACE),
            write_mask: wgpu::ColorWrites::ALL,
        })],
        compilation_options: wgpu::PipelineCompilationOptions::default(),
    }),
    // 계속...
```

여기서 주목할 몇 가지 사항이 있습니다:

1.  여기서 셰이더 내의 어떤 함수를 `entry_point`(진입점)로 사용할지 지정할 수 있습니다. 이들은 우리가 `@vertex`와 `@fragment`로 표시한 함수들입니다.
2.  `buffers` 필드는 `wgpu`에 어떤 타입의 정점을 정점 셰이더로 전달할지 알려줍니다. 우리는 정점 셰이더 자체에서 정점을 지정하고 있으므로, 이 필드는 비워둡니다. 다음 튜토리얼에서 여기에 무언가를 넣을 것입니다.
3.  `fragment`는 기술적으로 선택 사항이므로 `Some()`으로 감싸야 합니다. 색상 데이터를 `surface`에 저장하려면 이 필드가 필요합니다.
4.  `targets` 필드는 `wgpu`에 어떤 색상 출력을 설정해야 하는지 알려줍니다. 현재는 `surface`를 위한 하나만 필요합니다. `surface`의 포맷을 사용하여 복사가 용이하도록 하고, 블렌딩은 이전 픽셀 데이터를 새 데이터로 교체하도록 지정합니다. 또한 `wgpu`에게 모든 색상(빨강, 파랑, 초록, 알파)에 쓰도록 지시합니다. *`color_state`에 대해서는 텍스처를 다룰 때 더 이야기하겠습니다.*

```rust
    primitive: wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList, // 1.
        strip_index_format: None,
        front_face: wgpu::FrontFace::Ccw, // 2.
        cull_mode: Some(wgpu::Face::Back),
        // Fill 이외의 값으로 설정하려면 Features::NON_FILL_POLYGON_MODE가 필요합니다.
        polygon_mode: wgpu::PolygonMode::Fill,
        // Features::DEPTH_CLIP_CONTROL이 필요합니다.
        unclipped_depth: false,
        // Features::CONSERVATIVE_RASTERIZATION이 필요합니다.
        conservative: false,
    },
    // 계속...
```

`primitive` 필드는 정점을 삼각형으로 변환할 때 어떻게 해석할지 설명합니다.

1.  `PrimitiveTopology::TriangleList`를 사용하면 매 세 개의 정점이 하나의 삼각형에 해당하게 됩니다.
2.  `front_face`와 `cull_mode` 필드는 `wgpu`에 주어진 삼각형이 앞면을 향하고 있는지 여부를 결정하는 방법을 알려줍니다. `FrontFace::Ccw`는 정점이 반시계 방향으로 배열될 경우 삼각형이 앞면을 향하고 있음을 의미합니다. 앞면을 향하지 않는 것으로 간주되는 삼각형은 `CullMode::Back`에 지정된 대로 컬링됩니다(렌더링에 포함되지 않음). 컬링에 대해서는 `Buffer`를 다룰 때 좀 더 자세히 설명하겠습니다.

```rust
    depth_stencil: None, // 1.
    multisample: wgpu::MultisampleState {
        count: 1, // 2.
        mask: !0, // 3.
        alpha_to_coverage_enabled: false, // 4.
    },
    multiview: None, // 5.
    cache: None, // 6.
});
```

메서드의 나머지 부분은 꽤 간단합니다:

1.  현재 깊이/스텐실 버퍼를 사용하지 않으므로 `depth_stencil`은 `None`으로 둡니다. *이것은 나중에 변경될 것입니다*.
2.  `count`는 파이프라인이 사용할 샘플 수를 결정합니다. 멀티샘플링은 복잡한 주제이므로 여기서는 다루지 않겠습니다.
3.  `mask`는 어떤 샘플이 활성화되어야 하는지를 지정합니다. 이 경우 모든 샘플을 사용합니다.
4.  `alpha_to_coverage_enabled`는 안티에일리어싱과 관련이 있습니다. 여기서는 안티에일리어싱을 다루지 않으므로 지금은 `false`로 둡니다.
5.  `multiview`는 렌더 첨부 파일이 가질 수 있는 배열 레이어의 수를 나타냅니다. 우리는 배열 텍스처에 렌더링하지 않을 것이므로 `None`으로 설정할 수 있습니다.
6.  `cache`는 wgpu가 셰이더 컴파일 데이터를 캐시하도록 허용합니다. 안드로이드 빌드 타겟에만 유용합니다.

<!-- https://gamedev.stackexchange.com/questions/22507/what-is-the-alphatocoverage-blend-state-useful-for -->

이제 `render_pipeline`을 `State`에 추가하기만 하면 사용할 수 있습니다!

```rust
// new()
Ok(Self {
    surface,
    device,
    queue,
    config,
    is_surface_configured: false,
    render_pipeline,
    window,
})
```

## 파이프라인 사용하기

지금 프로그램을 실행하면 시작하는 데 시간이 조금 더 걸리지만, 여전히 지난 섹션에서 봤던 파란 화면이 나타날 것입니다. 이는 `render_pipeline`을 만들었지만, `render()`의 코드를 수정하여 실제로 사용하도록 해야 하기 때문입니다.

```rust
// render()

// ...
{
    // 1.
    let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("Render Pass"),
        color_attachments: &[
            // 이것이 프래그먼트 셰이더의 @location(0)이 타겟하는 것입니다.
            Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(
                        wgpu::Color {
                            r: 0.1,
                            g: 0.2,
                            b: 0.3,
                            a: 1.0,
                        }
                    ),
                    store: wgpu::StoreOp::Store,
                }
            })
        ],
        depth_stencil_attachment: None,
    });

    // NEW!
    render_pass.set_pipeline(&self.render_pipeline); // 2.
    render_pass.draw(0..3, 0..1); // 3.
}
// ...
```

많이 바꾸지는 않았지만, 바뀐 부분에 대해 이야기해 봅시다.

1.  `_render_pass`를 `render_pass`로 이름을 바꾸고 가변(mutable)으로 만들었습니다.
2.  `render_pass`에 방금 만든 파이프라인을 설정했습니다.
3.  `wgpu`에게 3개의 정점과 1개의 인스턴스로 *무언가*를 그리라고 지시합니다. 바로 여기서 `@builtin(vertex_index)`가 사용됩니다.

이 모든 것을 마치면 사랑스러운 갈색 삼각형을 보게 될 것입니다.

![언급된 사랑스러운 갈색 삼각형](./tutorial3-pipeline-triangle.png)

## 데모

<WasmExample example="tutorial3_pipeline"></WasmExample>

<AutoGithubLink/>

## 도전 과제

삼각형의 위치 데이터를 사용하여 색상을 만들고, 그 색상을 프래그먼트 셰이더로 보내는 두 번째 파이프라인을 만들어 보세요. 스페이스바를 누를 때마다 이 두 파이프라인이 서로 전환되도록 앱을 만들어 보세요. *힌트: `VertexOutput`을 수정해야 합니다.*

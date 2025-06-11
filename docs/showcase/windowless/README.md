# 창 없이 Wgpu 사용하기

때로는 단순히 GPU의 성능을 최대한 활용하고 싶을 때가 있습니다. 대규모의 숫자 집합을 병렬로 처리하고 싶을 수도 있고, 3D 영화 작업을 하면서 패스 트레이싱으로 사실적인 장면을 만들어야 할 수도 있습니다. 혹은 암호화폐를 채굴할 수도 있죠. 이 모든 상황에서, 우리는 진행 상황을 화면으로 *반드시* 볼 필요는 없습니다.

## 무엇을 해야 할까요?

사실 꽤 간단합니다. `Instance`를 생성하는 데 창이 *필요하지 않고*, `Adapter`를 선택하는 데도 창이 *필요하지 않으며*, `Device`를 만드는 데도 창이 *필요하지 않습니다*. 창이 필요했던 유일한 이유는 `SwapChain`을 만들기 위해 `Surface`가 필요했기 때문입니다. `Device`가 있다면, GPU에 명령을 보내기 위한 모든 준비가 된 것입니다.

```rust
let adapter = instance
    .request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::default(),
        compatible_surface: None,
    })
    .await
    .unwrap();
let (device, queue) = adapter
    .request_device(&Default::default(), None)
    .await
    .unwrap();
```

## 창 없이 삼각형 그리기

지금까지는 GPU가 하는 일을 볼 필요가 없다고 이야기했지만, 어느 시점에서는 결과를 확인해야 합니다. [surface 튜토리얼](/beginner/tutorial2-surface/#render)을 다시 살펴보면, `surface.get_current_texture()`를 사용해 렌더링할 텍스처를 가져왔습니다. 우리는 이제 그 단계를 건너뛰고 텍스처를 직접 만들 것입니다. 여기서 한 가지 주목할 점은, PNG는 BGRA가 아닌 RGBA를 사용하므로 `format`에 `surface.get_preferred_format(&adapter)` 대신 `wgpu::TextureFormat::Rgba8UnormSrgb`를 지정해야 한다는 것입니다.

```rust
let texture_size = 256u32;

let texture_desc = wgpu::TextureDescriptor {
    size: wgpu::Extent3d {
        width: texture_size,
        height: texture_size,
        depth_or_array_layers: 1,
    },
    mip_level_count: 1,
    sample_count: 1,
    dimension: wgpu::TextureDimension::D2,
    format: wgpu::TextureFormat::Rgba8UnormSrgb,
    usage: wgpu::TextureUsages::COPY_SRC
        | wgpu::TextureUsages::RENDER_ATTACHMENT
        ,
    label: None,
};
let texture = device.create_texture(&texture_desc);
let texture_view = texture.create_view(&Default::default());
```

`TextureUsages::RENDER_ATTACHMENT`는 wgpu가 우리 텍스처에 렌더링할 수 있도록 하기 위해 사용합니다. `TextureUsages::COPY_SRC`는 텍스처에서 데이터를 꺼내와 파일에 저장할 수 있도록 하기 위함입니다.

이 텍스처를 사용해 삼각형을 그릴 수는 있지만, 그 안의 픽셀 데이터에 접근할 방법이 필요합니다. [텍스처 튜토리얼](/beginner/tutorial5-textures/)에서는 버퍼를 사용해 파일에서 색상 데이터를 로드한 다음, 그 버퍼를 텍스처에 복사했습니다. 이제는 그 반대 과정을 할 것입니다: 텍스처에서 버퍼로 데이터를 복사하여 파일로 저장할 것입니다. 데이터를 담을 만큼 충분히 큰 버퍼가 필요합니다.

```rust
// 나중에 사용하기 위해 이 값을 저장해야 합니다.
let u32_size = std::mem::size_of::<u32>() as u32;

let output_buffer_size = (u32_size * texture_size * texture_size) as wgpu::BufferAddress;
let output_buffer_desc = wgpu::BufferDescriptor {
    size: output_buffer_size,
    usage: wgpu::BufferUsages::COPY_DST
        // wgpu에게 이 버퍼를 CPU에서 읽고 싶다고 알립니다.
        | wgpu::BufferUsages::MAP_READ,
    label: None,
    mapped_at_creation: false,
};
let output_buffer = device.create_buffer(&output_buffer_desc);
```

이제 그릴 대상을 만들었으니, 그릴 내용을 만들어 봅시다. 단순히 삼각형 하나를 그리는 것이므로, [파이프라인 튜토리얼](/beginner/tutorial3-pipeline/#writing-the-shaders)에서 셰이더 코드를 가져옵시다.

```glsl
// shader.vert
#version 450

const vec2 positions[3] = vec2[3](
    vec2(0.0, 0.5),
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5)
);

void main() {
    gl_Position = vec4(positions[gl_VertexIndex], 0.0, 1.0);
}
```

```glsl
// shader.frag
#version 450

layout(location=0) out vec4 f_color;

void main() {
    f_color = vec4(0.3, 0.2, 0.1, 1.0);
}
```

SPIR-V 모듈을 지원하도록 의존성을 업데이트합니다.

```toml
[dependencies]
image = "0.23"
shaderc = "0.7"
wgpu = { version = "0.19", features = ["spirv"] }
pollster = "0.3"
```

이 셰이더들을 사용해 간단한 `RenderPipeline`을 만들겠습니다.

```rust
let vs_src = include_str!("shader.vert");
let fs_src = include_str!("shader.frag");
let mut compiler = shaderc::Compiler::new().unwrap();
let vs_spirv = compiler
    .compile_into_spirv(
        vs_src,
        shaderc::ShaderKind::Vertex,
        "shader.vert",
        "main",
        None,
    )
    .unwrap();
let fs_spirv = compiler
    .compile_into_spirv(
        fs_src,
        shaderc::ShaderKind::Fragment,
        "shader.frag",
        "main",
        None,
    )
    .unwrap();
let vs_data = wgpu::util::make_spirv(vs_spirv.as_binary_u8());
let fs_data = wgpu::util::make_spirv(fs_spirv.as_binary_u8());
let vs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("Vertex Shader"),
    source: vs_data,
});
let fs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    label: Some("Fragment Shader"),
    source: fs_data,
});

let render_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
    label: Some("Render Pipeline Layout"),
    bind_group_layouts: &[],
    push_constant_ranges: &[],
});

let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    label: Some("Render Pipeline"),
    layout: Some(&render_pipeline_layout),
    vertex: wgpu::VertexState {
        module: &vs_module,
        entry_point: "main",
        buffers: &[],
    },
    fragment: Some(wgpu::FragmentState {
        module: &fs_module,
        entry_point: "main",
        targets: &[Some(wgpu::ColorTargetState {
            format: texture_desc.format,
            blend: Some(wgpu::BlendState::REPLACE),
            write_mask: wgpu::ColorWrites::ALL,
        })],
    }),
    primitive: wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList,
        strip_index_format: None,
        front_face: wgpu::FrontFace::Ccw,
        cull_mode: Some(wgpu::Face::Back),
        // Fill 이외의 값을 설정하려면 Features::NON_FILL_POLYGON_MODE 가 필요합니다.
        polygon_mode: wgpu::PolygonMode::Fill,
        // Features::DEPTH_CLIP_CONTROL가 필요합니다.
        unclipped_depth: false,
        // Features::CONSERVATIVE_RASTERIZATION가 필요합니다.
        conservative: false,
    },
    depth_stencil: None,
    multisample: wgpu::MultisampleState {
        count: 1,
        mask: !0,
        alpha_to_coverage_enabled: false,
    },
    // 렌더링할 수 있는 배열 텍스처의 최대 수를 설정합니다.
    multiview: None,
});
```

이제 인코더(encoder)가 필요하니, 만들어 봅시다.

```rust
let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    label: None,
});
```

`RenderPass` 부분부터 흥미로워집니다. 렌더 패스는 최소한 하나의 color attachment를 필요로 합니다. color attachment는 연결할 `TextureView`가 필요합니다. 이전에는 `SwapChain`의 텍스처를 사용했지만, 우리가 만든 `texture_view`를 포함한 어떤 `TextureView`든 사용할 수 있습니다.

```rust
{
    let render_pass_desc = wgpu::RenderPassDescriptor {
        label: Some("Render Pass"),
        color_attachments: &[
            Some(wgpu::RenderPassColorAttachment {
                view: &texture_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.1,
                        g: 0.2,
                        b: 0.3,
                        a: 1.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })
        ],
        depth_stencil_attachment: None,
        occlusion_query_set: None,
        timestamp_writes: None,
    };
    let mut render_pass = encoder.begin_render_pass(&render_pass_desc);

    render_pass.set_pipeline(&render_pipeline);
    render_pass.draw(0..3, 0..1);
}
```

데이터가 `Texture`에 갇혀 있으면 할 수 있는 것이 별로 없으니, `output_buffer`로 복사합시다.

```rust
encoder.copy_texture_to_buffer(
    wgpu::ImageCopyTexture {
        texture: &texture,
        mip_level: 0,
        origin: wgpu::Origin3d::ZERO,
        aspect: wgpu::TextureAspect::All,
    },
    wgpu::ImageCopyBuffer {
        buffer: &output_buffer,
        layout: wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(u32_size * texture_size),
            rows_per_image: Some(texture_size),
        },
    },
    texture_desc.size,
);
```

이제 모든 명령을 만들었으니, GPU에 제출합시다.

```rust
queue.submit(Some(encoder.finish()));
```

## 버퍼에서 데이터 꺼내기

버퍼에서 데이터를 꺼내려면, 먼저 버퍼를 매핑(map)해야 합니다. 그런 다음 `&[u8]`처럼 다룰 수 있는 `BufferView`를 얻을 수 있습니다.

```rust
// 매핑 관련 변수들을 스코프(scope)로 감싸서
// 버퍼를 unmap 할 수 있도록 해야 합니다.
{
    let buffer_slice = output_buffer.slice(..);

    // 참고: await를 호출하기 전에 먼저 매핑을 요청한 다음 device.poll()을
    // 호출해야 합니다. 그렇지 않으면 애플리케이션이 멈추게 됩니다.
    let (tx, rx) = futures_intrusive::channel::shared::oneshot_channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
        tx.send(result).unwrap();
    });
    device.poll(wgpu::PollType::Wait);
    rx.receive().await.unwrap().unwrap();

    let data = buffer_slice.get_mapped_range();

    use image::{ImageBuffer, Rgba};
    let buffer =
        ImageBuffer::<Rgba<u8>, _>::from_raw(texture_size, texture_size, data.as_ref()).unwrap();
    buffer.save("image.png").unwrap();
}
output_buffer.unmap();
```

<div class="note">

wgpu 레포지토리의 [예제](https://github.com/gfx-rs/wgpu/tree/master/wgpu/examples/capture)에서 사용하는 크레이트인 [futures-intrusive](https://docs.rs/futures-intrusive)를 사용했습니다.

</div>

## main 함수는 async로 만들 수 없습니다

`main()` 함수는 future를 반환할 수 없으므로, `async` 키워드를 사용할 수 없습니다. 이 문제를 해결하기 위해, 코드를 다른 함수에 넣고 `main()`에서 블록(block) 방식으로 호출할 것입니다. 이를 위해 [pollster 크레이트](https://docs.rs/pollster)와 같이 future를 폴링(poll)할 수 있는 크레이트가 필요합니다.

<div class="note">

[async-std](https://docs.rs/async-std)나 [tokio](https://docs.rs/tokio)와 같은 크레이트를 사용하면 `main()` 함수에 어노테이션을 붙여 `async`로 만들 수 있습니다. 하지만 두 크레이트 모두 이 프로젝트에는 조금 무겁다고 판단하여 사용하지 않았습니다. 여러분은 원하는 어떤 비동기 설정이든 자유롭게 사용하셔도 좋습니다 :slightly_smiling_face:

</div>

```rust
async fn run() {
    // 창 없는 렌더링 코드...
}

fn main() {
    pollster::block_on(run());
}
```

이 모든 과정을 마치면 다음과 같은 이미지가 생성될 것입니다.

![갈색 삼각형](./image-output.png)

<AutoGithubLink/>

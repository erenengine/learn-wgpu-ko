# Version 24.0

회사 일과 아기 때문에 바빠서 23.0 버전을 건너뛰었습니다! 그래도 이 튜토리얼에서 다루는 내용에 한해서는 22.0과 24.0 사이에 크게 바뀐 점은 없습니다.

## 엔트리 포인트(Entry point) 추론

만약 셰이더에 버텍스 셰이더를 위한 `@vertex`나 프래그먼트 셰이더를 위한 `@fragment`로 표시된 함수가 하나만 있는 경우, Wgpu에서 렌더 파이프라인을 생성할 때 엔트리 포인트를 명시할 필요가 없습니다. 즉, 엔트리 포인트를 직접 명시하고 싶다면 `Option`으로 감싸야 합니다.

```rust
device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(&format!("{:?}", shader)),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"), // 변경됨
            buffers: vertex_layouts,
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"), // 변경됨
            targets: &[Some(wgpu::ColorTargetState {
                format: color_format,
                blend: Some(wgpu::BlendState {
                    alpha: wgpu::BlendComponent::REPLACE,
                    color: wgpu::BlendComponent::REPLACE,
                }),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        // ...
    })
```

이는 컴퓨트 파이프라인에도 동일하게 적용됩니다.

```rust
let equirect_to_cubemap =
    device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("equirect_to_cubemap"),
        layout: Some(&pipeline_layout),
        module: &module,
        entry_point: Some("compute_equirect_to_cubemap"), // 변경됨
        compilation_options: Default::default(),
        cache: None,
    });
```

## 기타 변경 사항

- `ImageCopyTexture`가 `TexelCopyTextureInfo`로 이름이 변경되었습니다.
- `ImageDataLayout`이 `TexelCopyBufferLayout`으로 이름이 변경되었습니다.
- `ImageCopyBuffer`가 `TexelCopyBufferInfo`로 이름이 변경되었습니다.
- `wgpu::Instance::new()`가 이제 `&wgpu::InstanceDescriptor`에 대한 참조를 인자로 받습니다.
- `wgpu::SurfaceError::Other`가 새로 생겼습니다.

## WASM 실행하기

이게 `24.0` 버전만의 특징인지는 확실하지 않지만, `webpack`이 WASM을 제대로 처리하도록 하려면 `Cargo.toml`에 약간의 코드를 추가해야 했습니다.

```toml
# 이 코드는 루트 디렉터리의 Cargo.toml에 추가해야 합니다
[profile.release]
strip = true
```

이게 왜 필요한지 아신다면, 저에게도 알려주세요.

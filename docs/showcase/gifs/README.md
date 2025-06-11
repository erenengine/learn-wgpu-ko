# GIF 만들기

가끔 멋진 시뮬레이션이나 애니메이션을 만들고 나면, 이를 자랑하고 싶을 때가 있습니다. 비디오를 녹화할 수도 있지만, 트위터에 올릴 간단한 결과물을 위해 비디오 녹화 프로그램을 사용하는 것은 좀 과할 수 있습니다. 바로 이럴 때 [GIF](https://en.wikipedia.org/wiki/GIF)가 유용합니다.

참고로, GIF는 JIF(지프)가 아니라 GHIF(기프)로 발음합니다. JIF는 [땅콩버터](https://en.wikipedia.org/wiki/Jif_%28peanut_butter%29) 브랜드 이름일 뿐만 아니라, [다른 이미지 형식](https://filext.com/file-extension/JIF)의 이름이기도 합니다.

## 어떻게 GIF를 만들까요?

실제 이미지를 인코딩하기 위해 [gif 크레이트](https://docs.rs/gif/)를 사용하여 함수를 만들 것입니다.

```rust
fn save_gif(path: &str, frames: &mut Vec<Vec<u8>>, speed: i32, size: u16) -> Result<(), failure::Error> {
    use gif::{Frame, Encoder, Repeat, SetParameter};
    
    let mut image = std::fs::File::create(path)?;
    // 원문 코드에 너비, 높이 인수가 누락되어 있습니다. 올바른 사용법은 다음과 같을 수 있습니다:
    // let mut encoder = Encoder::new(&mut image, size, size, &[])?;
    let mut encoder = Encoder::new(&mut image, size, size, &[])?;
    encoder.set(Repeat::Infinite)?;

    for mut frame in frames {
        // 원문 코드에 너비, 높이 인수가 누락되어 있습니다. 올바른 사용법은 다음과 같을 수 있습니다:
        // encoder.write_frame(&Frame::from_rgba_speed(size, size, &mut frame, speed))?;
        encoder.write_frame(&Frame::from_rgba_speed(size, size, &mut frame, speed))?;
    }

    Ok(())
}
```

<!-- image-rs는 현재 루프 기능을 지원하지 않아 gif로 변경했습니다. -->
<!-- GIF는 이미지의 한 종류이며, 다행히도 [image 크레이트](https://docs.rs/image/)는 GIF를 네이티브로 지원합니다. 사용법은 매우 간단합니다. -->

<!-- ```rust
fn save_gif(path: &str, frames: &mut Vec<Vec<u8>>, speed: i32, size: u16) -> Result<(), failure::Error> {
    let output = std::fs::File::create(path)?;
    let mut encoder = image::gif::Encoder::new(output);

    for mut data in frames {
        let frame = image::gif::Frame::from_rgba_speed(size, size, &mut data, speed);
        encoder.encode(&frame)?;
    }

    Ok(())
}
``` -->

이 코드를 사용하기 위해 필요한 것은 GIF의 프레임, 재생 속도, 그리고 GIF의 크기(너비와 높이를 따로 사용할 수도 있지만, 여기서는 하나로 사용했습니다)뿐입니다.

## 어떻게 프레임을 만들까요?

[창 없는 쇼케이스](../windowless/#a-triangle-without-a-window)를 확인했다면, 우리가 `wgpu::Texture`에 직접 렌더링한다는 것을 아실 겁니다. 렌더링할 텍스처와 그 결과물을 복사할 버퍼를 생성할 것입니다.

```rust
// 렌더링할 텍스처 생성
let texture_size = 256u32;
let rt_desc = wgpu::TextureDescriptor {
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
        | wgpu::TextureUsages::RENDER_ATTACHMENT,
    label: None,
};
let render_target = framework::Texture::from_descriptor(&device, rt_desc);

// wgpu는 텍스처에서 버퍼로 복사 시 `wgpu::COPY_BYTES_PER_ROW_ALIGNMENT`에 맞춰
// 정렬할 것을 요구합니다. 이 때문에, 패딩이 추가된 행당 바이트 수(padded_bytes_per_row)와
// 패딩이 없는 행당 바이트 수(unpadded_bytes_per_row)를 모두 저장해야 합니다.
let pixel_size = mem::size_of::<[u8;4]>() as u32;
let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
let unpadded_bytes_per_row = pixel_size * texture_size;
let padding = (align - unpadded_bytes_per_row % align) % align;
let padded_bytes_per_row = unpadded_bytes_per_row + padding;

// 텍스처를 복사하여 데이터를 가져올 수 있도록 버퍼 생성
let buffer_size = (padded_bytes_per_row * texture_size) as wgpu::BufferAddress;
let buffer_desc = wgpu::BufferDescriptor {
    size: buffer_size,
    usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
    label: Some("Output Buffer"),
    mapped_at_creation: false,
};
let output_buffer = device.create_buffer(&buffer_desc);
```

이제 프레임을 렌더링하고, 그 프레임을 `Vec<u8>`로 복사할 수 있습니다.

```rust
let mut frames = Vec::new();

for c in &colors {
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: None,
    });

    let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("GIF Pass"),
        color_attachments: &[
            wgpu::RenderPassColorAttachment {
                view: &render_target.view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(
                        wgpu::Color {
                            r: c[0],
                            g: c[1],
                            b: c[2],
                            a: 1.0,
                        }
                    ),
                    store: wgpu::StoreOp::Store,
                },
            }
        ],
        depth_stencil_attachment: None,
    });

    rpass.set_pipeline(&render_pipeline);
    rpass.draw(0..3, 0..1);

    drop(rpass);

    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture: &render_target.texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &output_buffer,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(std::num::NonZeroU32::new(padded_bytes_per_row).unwrap()),
                rows_per_image: Some(std::num::NonZeroU32::new(texture_size).unwrap()),
            },
        },
        render_target.desc.size,
    );

    queue.submit(std::iter::once(encoder.finish()));
    
    // 맵핑 요청 생성
    let buffer_slice = output_buffer.slice(..);
    // 비동기 맵핑 요청. 참고: map_async는 &self를 받으므로 request 변수가 필요하지 않을 수 있습니다.
    let (tx, rx) = futures_intrusive::channel::shared::oneshot_channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
        tx.send(result).unwrap();
    });
    // GPU 작업이 끝날 때까지 대기
    device.poll(wgpu::PollType::Wait);
    let result = rx.receive().await;
    
    match result {
        Some(Ok(())) => {
            let padded_data = buffer_slice.get_mapped_range();
            // 각 행에서 패딩을 제거하여 실제 이미지 데이터만 수집
            let data = padded_data
                .chunks(padded_bytes_per_row as _)
                .map(|chunk| &chunk[..unpadded_bytes_per_row as _])
                .flatten()
                .copied()
                .collect::<Vec<_>>();
            drop(padded_data);
            output_buffer.unmap();
            frames.push(data);
        }
        _ => { eprintln!("Something went wrong") }
    }
}
```

이 작업이 끝나면 `save_gif()` 함수에 프레임들을 전달할 수 있습니다.

```rust
save_gif("output.gif", &mut frames, 1, texture_size as u16).unwrap();
```

이것이 기본적인 과정입니다. 텍스처 배열을 사용하고 그리기 명령을 한 번에 보내는 방식으로 성능을 개선할 수도 있지만, 이 예제는 기본적인 아이디어를 전달하는 데 중점을 둡니다. 제가 작성한 셰이더를 사용하면 다음과 같은 GIF를 얻을 수 있습니다.

![./output.gif](./output.gif)

<AutoGithubLink/>

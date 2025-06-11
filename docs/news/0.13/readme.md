# 0.13 버전으로 업데이트!

[WGPU 변경 로그](https://github.com/gfx-rs/wgpu/blob/master/CHANGELOG.md#wgpu-013-2022-06-30)

위 변경 로그에는 WGPU와 그에 따른 튜토리얼의 변경 사항 대부분이 포함되어 있습니다. `map_async()`의 사용법이 변경되었으므로, 이에 대해 특별히 언급하겠습니다. 이전에는 `map_async`가 프로미스(promise)를 반환했고, 버퍼의 내용에 접근하기 전에 이를 `await` 해야 했습니다. 이제는 매핑 시도의 `Result`를 매개변수로 받는 `'static` 콜백을 받도록 변경되었습니다. 이는 버퍼의 내용을 이미지로 저장하고자 할 때, 아래와 같은 방식 대신에,

```rust
{
    let buffer_slice = output_buffer.slice(..);

    let mapping = buffer_slice.map_async(wgpu::MapMode::Read);
    device.poll(wgpu::PollType::Wait)?;
    mapping.await.unwrap();

    let data = buffer_slice.get_mapped_range();

    use image::{ImageBuffer, Rgba};
    let buffer =
        ImageBuffer::<Rgba<u8>, _>::from_raw(texture_size, texture_size, data).unwrap();
    buffer.save("image.png").unwrap();
}
output_buffer.unmap();
```

다음과 같이 해야 한다는 것을 의미합니다.

```rust
{
    let buffer_slice = output_buffer.slice(..);

    // futures_intrusive::channel::shared::oneshot_channel을 사용합니다.
    let (tx, rx) = futures_intrusive::channel::shared::oneshot_channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
        tx.send(result).unwrap();
    });
    device.poll(wgpu::PollType::Wait)?;
    rx.receive().await.unwrap().unwrap();

    let data = buffer_slice.get_mapped_range();

    use image::{ImageBuffer, Rgba};
    let buffer =
        ImageBuffer::<Rgba<u8>, _>::from_raw(texture_size, texture_size, data).unwrap();
    buffer.save("image.png").unwrap();
}
output_buffer.unmap();
```

`map_async`가 변경된 이유에 대해서는 [해당 PR](https://github.com/gfx-rs/wgpu/pull/2698)에서 자세히 살펴보실 수 있습니다.

또 다른 참고 사항으로, 프레젠테이션 모드(presentation modes)는 이제 서피스(surface)가 지원하는 모드와 일치해야 합니다. [Surface::get_surface_modes()](https://docs.rs/wgpu/latest/wgpu/struct.Surface.html#method.get_supported_modes)를 통해 지원되는 모드 목록을 가져올 수 있습니다.

언제나처럼, 마이그레이션 과정에서 제가 놓친 부분이 있다면 알려주세요. [Learn Wgpu 저장소](https://github.com/sotrh/learn-wgpu)에 이슈를 등록하거나 PR을 제출해주실 수 있습니다

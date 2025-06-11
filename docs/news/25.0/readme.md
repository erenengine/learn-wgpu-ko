# 버전 25.0!

24.0 버전과 마찬가지로 튜토리얼 관련해서는 크게 변경된 점이 없습니다.
전체 패치 노트를 원하신다면 [여기](https://github.com/gfx-rs/wgpu/releases/tag/v25.0.0)에서 확인하실 수 있습니다.

하지만 두 가지 점이 바뀌었습니다.

1.  `requestDevice`가 이제 2개 대신 1개의 매개변수만 받으며, `trace`는 `DeviceDescriptor` 안으로 이동했습니다. 아래 코드 스니펫을 참고하세요.

    ```rust
    let (device, queue) = adapter.request_device(
        &wgpu::DeviceDescriptor {
            required_features: wgpu::Features::empty(),
            required_limits: if cfg!(target_arch = "wasm32") {
                wgpu::Limits::downlevel_webgl2_defaults()
            } else {
                wgpu::Limits::default()
            },
            label: None,
            memory_hints: Default::default(),
            trace: wgpu::Trace::Off, // 신규!
        },
        // 제거됨
    ).await.unwrap();
    ```

2.  `Device::poll()`이 `Maintain` 대신 `PollType`을 받습니다.

    ```rust
    device.poll(wgpu::PollType::Wait).unwrap();
    ```

바뀐 점은 이게 거의 전부입니다! 언제나처럼, 제가 놓친 부분이 있다면 레포(repo)에 자유롭게 이슈(issue)나 PR을 생성해주세요

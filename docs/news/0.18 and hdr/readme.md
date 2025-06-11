## 0.18 업데이트 및 HDR 튜토리얼

먼저 몇 가지 변경 사항을 살펴보겠습니다:

1.  `RenderPassDescriptor`에 이제 `occlusion_query_set`과 `timestamp_writes`라는 2개의 새로운 필드가 추가되었습니다.
    저는 일단 두 필드 모두 `None`으로 설정했습니다.
2.  `ComputePassDescriptor`에 `timestamp_writes` 필드가 추가되었습니다.
3.  `InstanceDescriptor`에도 몇 가지 필드가 추가되었지만, 저는 `backends`를 제외한 모든 필드에 `..Default::default()`를 사용하기로 했습니다.

## HDR 튜토리얼

컴퓨트 셰이더(compute shader)는 WebGPU를 특별하게 만드는 중요한 부분이지만, 현재 대부분의 브라우저에서 지원하지 않기 때문에 어떻게 소개해야 할지 고민이 많았습니다. 하지만 Chrome에서 WebGPU 지원을 시작하면서, 컴퓨트 셰이더 튜토리얼을 작성하는 데 더 자신감을 갖게 되었습니다.

또한, Polyhaven과 같은 사이트에서 HDR 이미지를 불러오는 방법을 배우는 데에도 관심이 많았습니다. 그래서 HDR 이미지를 불러와 렌더링에 사용할 큐브맵(Cubemap)으로 변환하는 컴퓨트 셰이더를 만들어보는 방식으로 컴퓨트 셰이더를 소개하기로 결정했습니다.

[여기](../../intermediate/tutorial13-hdr)에서 확인해 보세요

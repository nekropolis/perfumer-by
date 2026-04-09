type Props = {
    text?: string;
};

export default function AdminLoadingState({
                                              text = "Загрузка...",
                                          }: Props) {
    return <div className="text-gray-600">{text}</div>;
}